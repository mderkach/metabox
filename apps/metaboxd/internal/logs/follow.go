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

// Follow открывает поток новых строк не ниже уровня min и отдаёт их emit до
// отмены ctx или конца источника. emit зовётся из горутины потока и не должен
// блокироваться надолго.
//
// Горутину останавливает отмена ctx; её итог приходит в канал done ровно
// одним значением, и вызывающий обязан его дождаться. Ошибка до запуска —
// лимит потоков или недоступный источник — возвращается сразу. Обрыв
// источника поток не переподключает: панель открывает его заново.
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
		// Конец файла снимается до возврата: строка, дописанная сразу после
		// открытия потока, иначе могла бы попасть в отсчёт и не дойти до панели.
		offset, err := fileSize(src.file)
		if err != nil {
			release()

			return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
		}

		go func() {
			defer release()
			r.followFile(ctx, src.file, offset, f, emit)
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
		defer release()

		readErr := eachLine(out, func(line string) {
			if entry, ok := parseLogread(line, r.opts.Process); ok && f.pass(entry) {
				emit(entry)
			}
		})

		err := errors.Join(readErr, out.Close())
		// Отмена убивает logread, и его код возврата — следствие, а не отказ.
		if ctx.Err() != nil {
			err = nil
		}

		done <- err
	}()

	return done, nil
}

// followFile опрашивает размер файла: inotify в стандартной библиотеке нет.
// Файл, ставший короче, — усечён очисткой или заменён, — читается с начала;
// пропавший файл ждётся до отмены.
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

// readFrom отдаёт байты файла от offset до конца и новый размер. Файл короче
// offset читается с начала. За один опрос читается не больше fileTailBytes:
// всплеск записи не забирает память сверх этого.
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
