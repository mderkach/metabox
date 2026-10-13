package main

import (
	"fmt"
	"reflect"
	"strings"
	"unicode"
)

// registryUnion builds a union by the type field for one fork registry.
//
// In Go the payload is declared by the field `Options any` with the tag json:"-" and
// is substituted from the registry at runtime, while badjson puts it into JSON flat
// next to type and tag. This flat form is restored here.
func (w *walker) registryUnion(group registryGroup, shadow reflect.Type) *schema {
	out := &schema{kind: kindTagged, discr: "type"}

	for _, entry := range group.entries {
		name := variantName(group.name, entry.key)

		body := &schema{kind: kindObject}
		body.fields = append(body.fields, field{
			name:   "type",
			schema: scalar(fmt.Sprintf("z.literal(%q)", entry.key)),
		})
		w.appendCommonFields(body, shadow, "type", group.name+":"+entry.key)

		payload := entry.typ
		for payload.Kind() == reflect.Pointer {
			payload = payload.Elem()
		}
		expanded := w.expand(body, payload, group.name+":"+entry.key)

		w.set.put(name, oneOf(expanded))
		out.variants = append(out.variants, variant{ref(name)})
	}

	return out
}

// variantName gives the name of the variant schema: inbound + "bandwidth-limiter" ->
// InboundBandwidthLimiterSchema.
func variantName(registry, key string) string {
	var b strings.Builder
	b.WriteString(camel(registry))
	b.WriteString(camel(key))
	b.WriteString("Schema")
	return b.String()
}

func camel(s string) string {
	var b strings.Builder
	upper := true
	for _, r := range s {
		if r == '-' || r == '_' || r == '.' {
			upper = true
			continue
		}
		if upper {
			b.WriteRune(unicode.ToUpper(r))
			upper = false
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
