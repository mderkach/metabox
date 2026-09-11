package events

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"strings"
)

// sseReader разбирает поток SSE: панель делает то же самое через EventSource,
// а тесту нужен разбор без браузера.
type sseReader struct {
	reader *bufio.Reader
}

func newSSEReader(r io.Reader) *sseReader {
	return &sseReader{reader: bufio.NewReader(r)}
}

func (r *sseReader) next() (Event, error) {
	for {
		line, err := r.reader.ReadString('\n')
		if err != nil {
			return Event{}, err
		}

		payload, ok := strings.CutPrefix(strings.TrimRight(line, "\r\n"), "data: ")
		if !ok {
			continue
		}

		var event Event
		if err := json.Unmarshal([]byte(payload), &event); err != nil {
			return Event{}, errors.New("тело события не разбирается: " + payload)
		}

		return event, nil
	}
}
