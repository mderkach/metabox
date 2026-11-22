package logs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"syscall"
	"time"
)

// Follow opens a stream of new lines not below level min and passes them to emit until
// ctx is cancelled or the source ends. emit is called from the stream goroutine and must not
// block for long.
//
// The goroutine is stopped by ctx cancellation; its result arrives in the done channel as exactly
// one value, and the caller must wait for it. By this value the slot
// in the stream limit is already free: a client that reopens the stream right after
// closing the previous one will not hit the limit. An error before the start (the
// stream limit or an unavailable source) is returned at once. The stream does not reconnect
// when the source breaks: the panel opens it again.
func (r *Reader) Follow(ctx context.Context, minLevel Level, emit func(Entry)) (<-chan error, error) {
	select {
	case r.slots <- struct{}{}:
	default:
		return nil, ErrTooManyStreams
	}

	release := func() { <-r.slots }

	src, err := r.source(ctx)
	if err != nil {
		release()

		return nil, err
	}

	done, err := r.startFollow(ctx, src, r.filter(minLevel), emit, release, fileFollowOptions{})
	if err != nil {
		release()
	}

	return done, err
}

type fileFollowOptions struct {
	watchMissing bool
	onGap        func()
}

func (r *Reader) startFollow(
	ctx context.Context, src source, f filter, emit func(Entry), release func(), opts fileFollowOptions,
) (<-chan error, error) {
	done := make(chan error, 1)

	if src.file != "" {
		// The end of the file is taken before returning: a line appended right after
		// the stream opened could otherwise get into the count and not reach the panel.
		info, err := inspectFile(src.file)
		if err != nil && (!opts.watchMissing || !errors.Is(err, os.ErrNotExist)) {
			return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
		}

		go func() {
			err := r.followFile(ctx, src.file, info, f, emit, opts.onGap)
			release()
			done <- err
		}()

		return done, nil
	}

	out, err := r.start(ctx, r.opts.Logread, "-f", "-e", r.opts.Process)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	go func() {
		readErr := eachLine(out, func(line string) {
			if entry, ok := parseLogread(line, r.opts.Process); ok && f.pass(entry) {
				emit(entry)
			}
		})

		err := errors.Join(readErr, out.Close())
		// The cancel kills logread, and its exit code is a consequence, not a failure.
		if ctx.Err() != nil {
			err = nil
		}

		release()
		done <- err
	}()

	return done, nil
}

// followFile polls the file size: the standard library has no inotify.
// A file that became shorter (truncated by cleanup or replaced) is read from the start;
// a vanished file is waited for until cancellation.
func (r *Reader) followFile(
	ctx context.Context, path string, previous os.FileInfo, f filter, emit func(Entry), onGap func(),
) error {
	ticker := time.NewTicker(r.opts.PollInterval)
	defer ticker.Stop()

	var partial string

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}

		chunk, err := readFrom(path, previous)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return fmt.Errorf("%w: %w", ErrUnavailable, err)
		}

		if chunk.gap && onGap != nil {
			onGap()
		}
		if chunk.reset {
			partial = ""
		}

		previous = chunk.info

		lines := strings.Split(partial+chunk.lines, "\n")
		partial = lines[len(lines)-1]

		if len(partial) > lineLimit {
			partial = partial[:lineLimit]
		}

		for _, line := range lines[:len(lines)-1] {
			if entry, ok := parseFile(line); ok && f.pass(entry) {
				emit(entry)
			}
		}
	}
}

func inspectFile(path string) (os.FileInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("%w: expected a regular log file", ErrUnavailable)
	}

	return info, nil
}

type fileChunk struct {
	lines string
	info  os.FileInfo
	reset bool
	gap   bool
}

// readFrom bounds memory by dropping the oldest bytes of a burst. A shorter or
// replaced file starts a new line stream, even when the replacement is already larger.
func readFrom(path string, previous os.FileInfo) (fileChunk, error) {
	if _, err := inspectFile(path); err != nil {
		return fileChunk{}, err
	}

	// A path replaced with a FIFO between stat and open must not block shutdown.
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return fileChunk{}, err
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return fileChunk{}, err
	}
	if !info.Mode().IsRegular() {
		return fileChunk{}, fmt.Errorf("%w: expected a regular log file", ErrUnavailable)
	}

	size := info.Size()
	var offset int64
	reset := previous == nil || !os.SameFile(previous, info) || size < previous.Size()

	if !reset {
		offset = previous.Size()
	}

	start := max(offset, size-fileTailBytes)

	data, err := io.ReadAll(io.NewSectionReader(f, start, size-start))
	if err != nil {
		return fileChunk{}, err
	}

	if start > offset {
		_, after, _ := strings.Cut(string(data), "\n")

		return fileChunk{lines: after, info: info, reset: true, gap: true}, nil
	}

	// A replacement or truncation can discard an unread tail between polls.
	return fileChunk{lines: string(data), info: info, reset: reset, gap: previous != nil && reset}, nil
}
