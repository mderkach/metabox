package logs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
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

	f := r.filter(minLevel)
	done := make(chan error, 1)

	if src.file != "" {
		// The end of the file is taken before returning: a line appended right after
		// the stream opened could otherwise get into the count and not reach the panel.
		offset, err := fileSize(src.file)
		if err != nil {
			release()

			return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
		}

		go func() {
			r.followFile(ctx, src.file, offset, f, emit)
			release()
			done <- nil
		}()

		return done, nil
	}

	out, err := r.start(ctx, r.opts.Logread, "-f", "-e", r.opts.Process)
	if err != nil {
		release()

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
func (r *Reader) followFile(ctx context.Context, path string, offset int64, f filter, emit func(Entry)) {
	ticker := time.NewTicker(r.opts.PollInterval)
	defer ticker.Stop()

	var partial string

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		chunk, size, err := readFrom(path, offset)
		if err != nil {
			continue
		}

		if size < offset {
			partial = ""
		}

		offset = size

		lines := strings.Split(partial+chunk, "\n")
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

func fileSize(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}

	return info.Size(), nil
}

// readFrom returns the file bytes from offset to the end and the new size. A file shorter than
// offset is read from the start. No more than fileTailBytes is read per poll:
// a write burst does not take memory beyond that.
func readFrom(path string, offset int64) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return "", 0, err
	}

	size := info.Size()
	if size < offset {
		offset = 0
	}

	start := max(offset, size-fileTailBytes)

	data, err := io.ReadAll(io.NewSectionReader(f, start, size-start))
	if err != nil {
		return "", 0, err
	}

	if start > offset {
		_, after, _ := strings.Cut(string(data), "\n")

		return after, size, nil
	}

	return string(data), size, nil
}
