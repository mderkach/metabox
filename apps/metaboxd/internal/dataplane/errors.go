package dataplane

import "fmt"

// FieldReason is why an option value was not accepted. The set is closed: the panel
// picks the text in the user's language by it.
type FieldReason string

const (
	// ReasonInvalid means the value is not parsed: not a number, not an IP, not a MAC, not from
	// the set.
	ReasonInvalid FieldReason = "invalid"
	// ReasonOutOfRange means the port is outside 1–65535.
	ReasonOutOfRange FieldReason = "out_of_range"
	// ReasonDuplicate means the port matched the port of another inbound.
	ReasonDuplicate FieldReason = "duplicate"
	// ReasonRequired means the list is empty while the dataplane is enabled.
	ReasonRequired FieldReason = "required"
)

// FieldError is one value that was not accepted.
type FieldError struct {
	// Field is the UCI option name.
	Field string `json:"field"`
	// Value is the value as in UCI; for a list element, the element itself. Empty for
	// ReasonRequired.
	Value  string      `json:"value"`
	Reason FieldReason `json:"reason"`
}

// InvalidError means the model in UCI was not accepted; Fields lists all failures at once
// so that the owner does not fix them one by one.
type InvalidError struct {
	Fields []FieldError
}

func (e *InvalidError) Error() string {
	return fmt.Sprintf("модель обвязки не принята: полей с ошибкой %d", len(e.Fields))
}
