package clashapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

// errNotObject: the value turned out not to be an object, there is no member to insert into it.
var errNotObject = errors.New("value is not an object")

// span is the boundaries of a value in the original bytes: [start, end).
type span struct {
	start int
	end   int
}

// objectStart finds the start of the top-level object: the index of its '{'.
func objectStart(data []byte) (int, error) {
	for i, b := range data {
		if isSpace(b) {
			continue
		}
		if b != '{' {
			return 0, fmt.Errorf("config starts with %q, not with an object", b)
		}

		return i, nil
	}

	return 0, errors.New("config is empty")
}

// findMember looks for a member of the object starting at data[start] and returns the boundaries of
// its value in data coordinates. The boundaries are needed to edit bytes surgically:
// parsing into a struct and reverse serialization would rewrite the order of the
// user's keys.
func findMember(data []byte, start int, key string) (span, bool, error) {
	dec := json.NewDecoder(bytes.NewReader(data[start:]))

	tok, err := dec.Token()
	if err != nil {
		return span{}, false, fmt.Errorf("parse object: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '{' {
		return span{}, false, errNotObject
	}

	for dec.More() {
		name, err := dec.Token()
		if err != nil {
			return span{}, false, fmt.Errorf("parse key: %w", err)
		}

		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return span{}, false, fmt.Errorf("parse value %v: %w", name, err)
		}

		end := start + int(dec.InputOffset())
		if name == key {
			return span{start: end - len(raw), end: end}, true, nil
		}
	}

	return span{}, false, nil
}

// insertMember appends a member at the start of the object. At the start, not the end: this way
// there is no need to look for the closing bracket and parse trailing whitespace, and
// the order of the other keys stays as it was.
func insertMember(data []byte, objStart int, text string) []byte {
	at := objStart + 1
	indent := indentAfterBrace(data, objStart)

	out := make([]byte, 0, len(data)+len(indent)+len(text)+1)
	out = append(out, data[:at]...)
	out = append(out, indent...)
	out = append(out, text...)
	if !objectIsEmpty(data, objStart) {
		out = append(out, ',')
	}

	return append(out, data[at:]...)
}

// replaceSpan replaces a value in place, touching nothing around it.
func replaceSpan(data []byte, at span, text string) []byte {
	out := make([]byte, 0, len(data)-(at.end-at.start)+len(text))
	out = append(out, data[:at.start]...)
	out = append(out, text...)

	return append(out, data[at.end:]...)
}

// indentAfterBrace returns the whitespace right after '{'. The insertion repeats it, and in
// a human-readable config the new section lands in its place and does not stick
// to the previous line.
func indentAfterBrace(data []byte, objStart int) string {
	i := objStart + 1
	for i < len(data) && isSpace(data[i]) {
		i++
	}

	return string(data[objStart+1 : i])
}

func objectIsEmpty(data []byte, objStart int) bool {
	for i := objStart + 1; i < len(data); i++ {
		if isSpace(data[i]) {
			continue
		}

		return data[i] == '}'
	}

	return false
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r'
}
