package locale

import (
	"errors"
	"fmt"
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

func (e *Error) in(l Lang) string {
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

// Message returns the text of err in the language l. A layer made by New or
// Errorf is translated together with the errors it formats; a layer made
// otherwise is returned as is, with everything it wraps.
func Message(l Lang, err error) string {
	if e, ok := err.(*Error); ok { //nolint:errorlint // only the outer layer: an inner one is already part of a foreign text
		return e.in(l)
	}

	return err.Error()
}
