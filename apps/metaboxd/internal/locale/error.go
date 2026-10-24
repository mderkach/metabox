package locale

import (
	"errors"
	"fmt"
	"strings"
)

// Error is an error whose text reaches the operator. Error returns English, the
// text for the log; Message returns it in the operator's language. errors.Is and
// errors.As see through it the same way as through fmt.Errorf.
type Error struct {
	format string
	args   []any
	err    error
	// verbatim: the text came through New and is not a format.
	verbatim bool
}

// New is errors.New for a text that reaches the operator.
func New(text string) *Error {
	return &Error{format: text, err: errors.New(text), verbatim: true}
}

// Errorf is fmt.Errorf for a text that reaches the operator. format is a string
// literal, as for T.
func Errorf(format string, args ...any) *Error {
	return &Error{format: format, args: args, err: fmt.Errorf(format, args...)}
}

func (e *Error) Error() string {
	return e.err.Error()
}

func (e *Error) Unwrap() []error {
	switch wrapped := e.err.(type) { //nolint:errorlint // the result of fmt.Errorf itself, not a chain
	case interface{ Unwrap() []error }:
		return wrapped.Unwrap()
	case interface{ Unwrap() error }:
		return []error{wrapped.Unwrap()}
	default:
		return nil
	}
}

// In returns the text in the language l.
func (e *Error) In(l Lang) string {
	if e.verbatim {
		return T(l, e.format)
	}

	args := make([]any, len(e.args))

	for i, arg := range e.args {
		if err, ok := arg.(error); ok && err != nil {
			args[i] = errors.New(Message(l, err))

			continue
		}

		args[i] = arg
	}

	return fmt.Errorf(T(l, e.format), args...).Error()
}

// Message returns the text of err in the language l. A layer with an In method,
// such as one made by New or Errorf, is translated together with the errors it
// formats, and so is each part of errors.Join; any other layer is returned as
// is, with everything it wraps.
func Message(l Lang, err error) string {
	switch e := err.(type) { //nolint:errorlint // only the outer layer: an inner one is already part of a foreign text
	case interface{ In(l Lang) string }:
		return e.In(l)
	case interface{ Unwrap() []error }:
		if parts := joined(err, e.Unwrap()); parts != nil {
			texts := make([]string, len(parts))
			for i, part := range parts {
				texts[i] = Message(l, part)
			}

			return strings.Join(texts, "\n")
		}
	}

	return err.Error()
}

// joined returns the parts when err is made by errors.Join, whose text is the parts
// joined by newlines; a fmt.Errorf with several %w has a text of its own and gets nil.
func joined(err error, wrapped []error) []error {
	var parts []error
	var texts []string

	for _, part := range wrapped {
		if part != nil {
			parts = append(parts, part)
			texts = append(texts, part.Error())
		}
	}

	if len(parts) == 0 || strings.Join(texts, "\n") != err.Error() {
		return nil
	}

	return parts
}
