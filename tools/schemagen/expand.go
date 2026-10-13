package main

import (
	"fmt"
	"reflect"
)

// A routing rule embeds an action, and an action is a union by the field
// action. In JSON both lie on one level, so the object
// has to be multiplied: as many forms of the rule as there are action variants.
//
// The common fields are moved into a separate schema, and variants are printed as
// an extension: otherwise six dozen rule fields would be duplicated in
// each variant.
func (w *walker) expand(base *schema, t reflect.Type, path string) []*schema {
	object := &schema{kind: kindObject, base: base.base}
	object.fields = append(object.fields, base.fields...)
	embedded := w.appendFields(object, t, path)
	object.fields = dedupe(object.fields)

	variants := []*schema{object}
	for _, union := range embedded {
		variants = w.multiply(variants, union, t, path)
	}
	return variants
}

// multiply multiplies every collected object by the variants of the embedded
// union.
func (w *walker) multiply(objects []*schema, union embeddedUnion, owner reflect.Type, path string) []*schema {
	discrOptional := w.discrOptional(union.typ, union.spec.discr)

	var out []*schema
	for _, object := range objects {
		shared := w.shareFields(object, owner)

		for _, option := range union.spec.variants {
			body := &schema{kind: kindObject, base: shared.base}
			body.fields = append(body.fields, shared.fields...)
			body.fields = append(body.fields, field{
				name:     union.spec.discr,
				schema:   scalar(fmt.Sprintf("z.literal(%q)", option.tag)),
				optional: discrOptional,
			})

			if option.field == "" {
				out = append(out, body)
				continue
			}

			variantField, ok := union.typ.FieldByName(option.field)
			if !ok {
				panic(fmt.Sprintf("schemagen: %s: no field %s",
					goTypeName(union.typ), option.field))
			}
			out = append(out, w.expand(body, deref(variantField.Type), path+"."+option.tag)...)
		}
	}
	return out
}

// shareFields moves the already collected fields into a separate schema so that variants
// refer to it and do not repeat it whole. Short objects stay as
// they are: a separate schema for three fields reads worse than the fields themselves.
func (w *walker) shareFields(object *schema, owner reflect.Type) *schema {
	const worthSharing = 6

	if object.base != "" || len(object.fields) < worthSharing {
		return object
	}

	name := baseName(owner)
	if _, exists := w.set.byName[name]; !exists {
		w.set.put(name, &schema{kind: kindObject, fields: object.fields})
	}
	return &schema{kind: kindObject, base: name}
}

// baseName gives the name of the schema with the common fields: option.RuleAction ->
// RuleActionBaseSchema.
func baseName(t reflect.Type) string {
	return t.Name() + "BaseSchema"
}

// oneOf collapses a set of variants: a single variant stays an object.
func oneOf(variants []*schema) *schema {
	if len(variants) == 1 {
		return variants[0]
	}
	out := &schema{kind: kindUnion}
	for _, v := range variants {
		out.variants = append(out.variants, variant{v})
	}
	return out
}
