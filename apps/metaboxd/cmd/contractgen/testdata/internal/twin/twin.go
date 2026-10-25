// Package twin holds a type with the same name as in sample: two enums with
// the same name must be split into separate constants, not displace each
// other.
package twin

import "metabox/internal/sample"

// Kind is a namesake of `sample.Kind` with other values.
type Kind string

const (
	// KindOther is a value the namesake does not have.
	KindOther Kind = "other"
)

// Holder is the owner of an enum.
type Holder struct {
	Kind Kind `json:"kind"`
}

// Borrower refers to an enum of another package.
type Borrower struct {
	Kind sample.Kind `json:"kind"`
}
