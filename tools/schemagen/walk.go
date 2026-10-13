package main

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
)

// walker translates the fork Go types into the intermediate tree. Named
// structs are moved into separate schemas, the rest is printed in place.
type walker struct {
	set      *schemaSet
	building map[reflect.Type]string // type -> schema name, including unfinished ones
	unknown  map[string][]string     // unrecognized type -> paths where it was met
	byGoType map[string]*schema      // ready schemas: registry unions and rules by type
	docs     *docSet                 // fork godoc: type and field descriptions
}

func newWalker(docs *docSet) *walker {
	return &walker{
		set:      newSchemaSet(),
		building: map[reflect.Type]string{},
		unknown:  map[string][]string{},
		byGoType: map[string]*schema{},
		docs:     docs,
	}
}

func (w *walker) note(t reflect.Type, path string) {
	name := goTypeName(t)
	if len(w.unknown[name]) < 5 {
		w.unknown[name] = append(w.unknown[name], path)
	}
}

// unknownReport returns a sorted list of unrecognized types.
func (w *walker) unknownReport() []string {
	if len(w.unknown) == 0 {
		return nil
	}
	out := make([]string, 0, len(w.unknown))
	for name, paths := range w.unknown {
		out = append(out, fmt.Sprintf("  %s — %s", name, strings.Join(paths, ", ")))
	}
	sort.Strings(out)
	return out
}

// build returns the schema of a type. Pointers are dereferenced by the caller:
// they do not affect the JSON shape but do affect field required-ness.
//
// Named types of the option package are moved into separate schemas, and the name
// is reserved before the body is built: routing rules refer to
// themselves, and without such a cut-off the walk would loop.
func (w *walker) build(t reflect.Type, path string) *schema {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}

	if name, ok := w.building[t]; ok {
		return ref(name)
	}
	if s, ok := w.byGoType[goTypeName(t)]; ok {
		return s
	}

	if name, exported := schemaName(t); exported {
		w.building[t] = name
		body := w.body(t, path)
		w.set.put(name, body)
		return ref(name)
	}
	return w.body(t, path)
}

// body builds the schema of a type regardless of naming.
func (w *walker) body(t reflect.Type, path string) *schema {
	if s, ok := w.override(t, path); ok {
		return s
	}

	switch t.Kind() {
	case reflect.Bool:
		return scalar("z.boolean()")

	case reflect.String:
		return scalar("z.string()")

	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return scalar(intSchema(t))

	case reflect.Float32, reflect.Float64:
		return scalar("z.number()")

	case reflect.Slice, reflect.Array:
		// []byte is serialized by the standard library into a base64 string.
		if t.Elem().Kind() == reflect.Uint8 && t.Elem().PkgPath() == "" {
			return scalar("z.string()")
		}
		return array(w.build(t.Elem(), path+"[]"))

	case reflect.Map:
		return record(w.build(t.Elem(), path+"{}"))

	case reflect.Struct:
		// A struct with its own serialization and no rule in the table: walking its
		// fields would print a schema that does not match the config. Such a type
		// is accumulated and aborts generation.
		if hasCustomJSON(t) {
			w.note(t, path)
			return scalar("z.unknown()")
		}
		return w.plainStruct(t, path)

	case reflect.Interface:
		// The payload of registry nodes: substituted by union variants
		// in the parent, it has no schema of its own.
		return scalar("z.unknown()")

	default:
		w.note(t, path)
		return scalar("z.unknown()")
	}
}

// intSchema: a JSON number limited by the range of the Go type as far as
// it is expressible without transform.
func intSchema(t reflect.Type) string {
	switch t.Kind() {
	case reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int, reflect.Int64:
		return "z.int()"
	default:
		return "z.int().nonnegative()"
	}
}

// plainStruct collects the struct fields, flattening embedded ones: badjson puts them
// into JSON flat, and no nested object appears in the config. Called from
// the rules that have already established that the JSON shape matches the fields.
//
// An embedded union (a routing rule embeds an action) is expanded
// into a union of objects: there are as many levels of action fields in JSON as in
// the rule itself.
func (w *walker) plainStruct(t reflect.Type, path string) *schema {
	return oneOf(w.expand(&schema{kind: kindObject}, t, path))
}

// embeddedUnion is an embedded struct that has its own union shape.
type embeddedUnion struct {
	typ  reflect.Type
	spec taggedSpec
}

// appendFields adds the struct fields to an object and returns the embedded
// unions that the calling code must expand.
func (w *walker) appendFields(out *schema, t reflect.Type, path string) []embeddedUnion {
	return w.appendFieldsAt(out, t, path, 0)
}

func (w *walker) appendFieldsAt(out *schema, t reflect.Type, path string, depth int) []embeddedUnion {
	var unions []embeddedUnion

	for i := range t.NumField() {
		f := t.Field(i)
		if f.PkgPath != "" {
			continue
		}

		tag := f.Tag.Get("json")
		name, _, _ := strings.Cut(tag, ",")

		if f.Anonymous && name == "" {
			embedded := deref(f.Type)
			if embedded.Kind() == reflect.Struct {
				if spec, ok := taggedSpecs[goTypeName(embedded)]; ok {
					unions = append(unions, embeddedUnion{embedded, spec})
					continue
				}
				unions = append(unions, w.appendFieldsAt(out, embedded, path, depth+1)...)
				continue
			}
		}

		if name == "-" || (name == "" && tag == "-") {
			continue
		}
		if name == "" {
			name = f.Name
		}

		// All fields are optional: encoding/json knows no required fields,
		// a missing key gives a zero value, not an error. Only the discriminator
		// of a union is required: without it the fork cannot select a variant.
		out.fields = append(out.fields, field{
			name:     name,
			schema:   w.build(f.Type, path+"."+name),
			optional: true,
			depth:    depth,
			doc:      w.docs.field(goTypeName(t), f.Name),
		})
	}

	return unions
}

// schemaName gives the schema name for a named struct of the fork option package.
// Other structs are printed in place: names like linkedhashmap.Map
// are not needed in the schema.
func schemaName(t reflect.Type) (string, bool) {
	if t.Name() == "" || t.PkgPath() == "" {
		return "", false
	}
	if !strings.HasSuffix(t.PkgPath(), "/option") {
		return "", false
	}
	if strings.ContainsAny(t.Name(), "[]") {
		return "", false
	}
	return t.Name() + "Schema", true
}

func goTypeName(t reflect.Type) string {
	if t.Name() != "" && t.PkgPath() != "" {
		parts := strings.Split(t.PkgPath(), "/")
		return parts[len(parts)-1] + "." + t.Name()
	}
	return t.String()
}

// hasCustomJSON: the type decides itself how it looks in JSON, so its shape
// cannot be derived from the struct fields.
func hasCustomJSON(t reflect.Type) bool {
	pointer := reflect.PointerTo(t)
	for _, method := range []string{"MarshalJSON", "MarshalJSONContext", "UnmarshalJSON", "UnmarshalJSONContext"} {
		if _, ok := pointer.MethodByName(method); ok {
			return true
		}
	}
	_, ok := pointer.MethodByName("MarshalText")
	return ok
}

// genericBase cuts the parameter list off a generic:
// badoption.Listable[string] -> badoption.Listable.
func genericBase(t reflect.Type) string {
	name := goTypeName(t)
	if i := strings.IndexByte(name, '['); i > 0 {
		return name[:i]
	}
	return name
}
