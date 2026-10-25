package main

import (
	"reflect"
	"testing"
)

// The panel validates by the schema alone, so an integer field must stop where the Go
// type stops: a uint16 port that accepts 65536 passes the panel and fails sing-box.
func TestIntSchemaBoundsByGoWidth(t *testing.T) {
	tests := []struct {
		name string
		typ  reflect.Type
		want string
	}{
		{"uint8", reflect.TypeFor[uint8](), "z.int().nonnegative().max(255)"},
		{"uint16", reflect.TypeFor[uint16](), "z.int().nonnegative().max(65535)"},
		{"uint32", reflect.TypeFor[uint32](), "z.int().nonnegative().max(4294967295)"},
		{"int8", reflect.TypeFor[int8](), "z.int().min(-128).max(127)"},
		{"int32", reflect.TypeFor[int32](), "z.int().min(-2147483648).max(2147483647)"},
		{"int64 keeps the safe-integer bound", reflect.TypeFor[int64](), "z.int()"},
		{"uint64 keeps only the sign", reflect.TypeFor[uint64](), "z.int().nonnegative()"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := intSchema(tt.typ); got != tt.want {
				t.Errorf("intSchema(%s) = %q, want %q", tt.typ, got, tt.want)
			}
		})
	}
}

// The field reference reads the bounds back: an agent sees the range, not an opaque
// expression.
func TestDescribeScalarReadsIntegerBounds(t *testing.T) {
	tests := []struct {
		expr string
		want string
	}{
		{"z.int().nonnegative().max(65535)", "integer 0..65535"},
		{"z.int().min(-128).max(127)", "integer -128..127"},
		{"z.int().nonnegative()", "integer >= 0"},
		{"z.int()", "integer"},
	}

	for _, tt := range tests {
		t.Run(tt.expr, func(t *testing.T) {
			got, _, ok := describeScalar(tt.expr)
			if !ok || got != tt.want {
				t.Errorf("describeScalar(%q) = %q, %v; want %q", tt.expr, got, ok, tt.want)
			}
		})
	}
}
