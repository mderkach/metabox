package main

import (
	"fmt"
	"reflect"
	"strings"
)

// The static unions of the fork are declared uniformly: a discriminator field and
// a json:"-" field per variant. They need no registry: the variants are known at
// compile time, and badjson puts the chosen variant flat next to
// the discriminator.
type taggedSpec struct {
	discr    string      // field name in JSON: type, action, provider, version
	variants []tagOption // the order sets the order of variants in the schema
	// numeric: the discriminator is a number, and the literal is printed without quotes.
	// http_clients has such a union, where the protocol version selects the variant.
	numeric bool
}

type tagOption struct {
	tag   string // discriminator value
	field string // Go struct field with the variant options; empty means a variant without options
}

// taggedUnion builds a union: the common struct fields plus the fields of the chosen
// variant, flattened into the same object.
func (w *walker) taggedUnion(t reflect.Type, spec taggedSpec, path string) *schema {
	discrOptional := w.discrOptional(t, spec.discr)

	out := &schema{kind: kindTagged, discr: spec.discr}
	if discrOptional {
		// The discriminator may be omitted (the fork substitutes the default
		// value), while z.discriminatedUnion requires it to be present.
		out = &schema{kind: kindUnion}
	}

	for _, option := range spec.variants {
		body := &schema{kind: kindObject}
		body.fields = append(body.fields, field{
			name:     spec.discr,
			schema:   scalar(literalOf(option.tag, spec.numeric)),
			optional: discrOptional,
		})
		w.appendCommonFields(body, t, spec.discr, path)

		if option.field == "" {
			out.variants = append(out.variants, variant{body})
			continue
		}

		variantField, ok := t.FieldByName(option.field)
		if !ok {
			panic(fmt.Sprintf("schemagen: %s: no field %s", goTypeName(t), option.field))
		}
		for _, expanded := range w.expand(body, deref(variantField.Type), path+"."+option.tag) {
			out.variants = append(out.variants, variant{expanded})
		}
	}
	return out
}

// literalOf prints the discriminator value: a number as a literal, everything else
// as a string.
func literalOf(tag string, numeric bool) string {
	if numeric {
		return fmt.Sprintf("z.literal(%s)", tag)
	}

	return fmt.Sprintf("z.literal(%q)", tag)
}

// appendCommonFields moves the fields common to all variants of a union: the
// discriminator itself and the variant fields (json:"-") are skipped.
//
// The walk is the same as for an ordinary struct: the fork puts embedded fields into JSON
// flat, and a shortened copy of the walk would lose them entirely: an embedded
// field has no json tag and is not selected by name.
func (w *walker) appendCommonFields(out *schema, t reflect.Type, discr, path string) {
	common := &schema{kind: kindObject}

	if unions := w.appendFields(common, t, path); len(unions) > 0 {
		panic(fmt.Sprintf("schemagen: %s: embedded union inside a union by %q", goTypeName(t), discr))
	}

	for _, f := range dedupe(common.fields) {
		if f.name == discr {
			continue
		}
		out.fields = append(out.fields, f)
	}
}

// discrOptional: the discriminator has omitempty, so it
// may be absent from the config.
func (w *walker) discrOptional(t reflect.Type, discr string) bool {
	for i := range t.NumField() {
		name, opts, _ := strings.Cut(t.Field(i).Tag.Get("json"), ",")
		if name == discr {
			return strings.Contains(opts, "omitempty")
		}
	}
	return false
}

func deref(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}
