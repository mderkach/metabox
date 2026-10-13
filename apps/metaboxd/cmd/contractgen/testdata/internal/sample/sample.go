// Package sample holds the shapes the generator is tested on: mixed
// tag naming, optional fields, nested structs and standard
// library types. The package is not built with the daemon, it lies in testdata.
package sample

import (
	"encoding/json"
	"time"
)

// Phase is a type over a string: it stays a string on the wire.
type Phase string

// Nested is a nested struct: the owner schema refers to it.
type Nested struct {
	// Value is a field with a comment: it goes into JSDoc.
	Value string `json:"value"`
}

// Sample gathers the cases where a mechanical translation breaks.
type Sample struct {
	SnakeField  string            `json:"snake_field"`
	CamelField  string            `json:"lastError,omitempty"`
	Abbreviated string            `json:"sourceIP"`
	Pointer     *Nested           `json:"pointer,omitempty"`
	Required    Nested            `json:"required"`
	List        []string          `json:"list"`
	Dictionary  map[string]Nested `json:"dictionary"`
	Duration    time.Duration     `json:"window"`
	Moment      time.Time         `json:"moment"`
	Raw         json.RawMessage   `json:"raw"`
	Phase       Phase             `json:"phase"`
	Count       int               `json:"count"`
	Ratio       float64           `json:"ratio"`
	Flag        bool              `json:"flag"`
	Hidden      string            `json:"-"`
	Untagged    string
}

// Kind is an enum: the values go into the schema as a list.
type Kind string

const (
	// KindFirst is the first value.
	KindFirst Kind = "first"
	// KindSecond is the second value.
	KindSecond Kind = "second"
)

// Loose is a constant without a type next to an enum: it is not a member of Kind, and it
// must not get into its list.
const Loose = "loose"

// Tagged is the owner of an enum: the generator reaches Kind through it.
type Tagged struct {
	Kind Kind `json:"kind"`
}
