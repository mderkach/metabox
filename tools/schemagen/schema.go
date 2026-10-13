package main

import (
	"fmt"
	"sort"
	"strings"
)

type kind int

const (
	kindScalar kind = iota // ready zod expression
	kindObject
	kindArray
	kindRecord // object with arbitrary keys
	kindUnion
	kindTagged // z.discriminatedUnion by a string field
	kindRef    // reference to a named schema
)

// schema is a node of the intermediate tree. It is printed into a Zod expression; nothing
// that cannot be expressed in z.toJSONSchema should appear here.
type schema struct {
	kind kind

	expr string // kindScalar
	ref  string // kindRef

	base     string    // kindObject: name of the schema with common fields that fields are added to
	fields   []field   // kindObject
	elem     *schema   // kindArray, kindRecord
	variants []variant // kindUnion, kindTagged
	discr    string    // kindTagged: name of the discriminator field
}

type field struct {
	name     string
	schema   *schema
	optional bool
	depth    int    // embedding depth: name shadowing is resolved by it
	doc      string // godoc of the fork field: the panel shows it in hints and in the auto-renderer
}

// dedupe repeats the encoding/json rules for embedded structs: on
// a name clash the field with the smaller embedding depth wins, and fields
// of the same depth conflict and do not get into JSON at all.
func dedupe(fields []field) []field {
	depth := map[string]int{}
	conflict := map[string]bool{}

	for _, f := range fields {
		known, seen := depth[f.name]
		switch {
		case !seen || f.depth < known:
			depth[f.name] = f.depth
			delete(conflict, f.name)
		case f.depth == known:
			conflict[f.name] = true
		}
	}

	out := make([]field, 0, len(fields))
	taken := map[string]bool{}
	for _, f := range fields {
		if conflict[f.name] || taken[f.name] || f.depth != depth[f.name] {
			continue
		}
		taken[f.name] = true
		out = append(out, f)
	}
	return out
}

type variant struct {
	schema *schema
}

func scalar(expr string) *schema { return &schema{kind: kindScalar, expr: expr} }

func ref(name string) *schema { return &schema{kind: kindRef, ref: name} }

func array(elem *schema) *schema { return &schema{kind: kindArray, elem: elem} }

func record(elem *schema) *schema { return &schema{kind: kindRecord, elem: elem} }

// listable repeats badoption.Listable[T]: a single value or an array.
func listable(elem *schema) *schema {
	return &schema{kind: kindUnion, variants: []variant{{elem}, {array(elem)}}}
}

func union(items ...*schema) *schema {
	variants := make([]variant, 0, len(items))
	for _, item := range items {
		variants = append(variants, variant{schema: item})
	}
	return &schema{kind: kindUnion, variants: variants}
}

// collectRefs collects the names of the schemas a node refers to. The fields of an object
// are walked by withFields: references from them are computed later than the rest, and
// the declaration order does not depend on them.
func (s *schema) collectRefs(into map[string]bool, withFields bool) {
	switch s.kind {
	case kindScalar:
		// A scalar is a ready zod expression, it has nothing to refer to.
	case kindRef:
		into[s.ref] = true
	case kindArray, kindRecord:
		s.elem.collectRefs(into, withFields)
	case kindUnion, kindTagged:
		for _, v := range s.variants {
			v.schema.collectRefs(into, withFields)
		}
	case kindObject:
		if s.base != "" {
			into[s.base] = true
		}
		if withFields {
			for _, f := range s.fields {
				f.schema.collectRefs(into, withFields)
			}
		}
	}
}

// hasRef: inside the node there is a reference to another schema, so in an object it
// must be given as a getter, otherwise the declaration would have to be placed strictly after
// what it refers to, and with mutual recursion there is no such order.
func (s *schema) hasRef() bool {
	found := map[string]bool{}
	s.collectRefs(found, true)
	return len(found) > 0
}

// hardRefs are the references computed right at the schema declaration: everything
// outside the object fields (fields go into getters). They set the order
// of declarations in the file.
func (s *schema) hardRefs(into map[string]bool) {
	s.collectRefs(into, false)
}

// write prints a Zod expression with the indent.
func (s *schema) write(b *strings.Builder, indent string) {
	switch s.kind {
	case kindScalar:
		b.WriteString(s.expr)

	case kindRef:
		b.WriteString(s.ref)

	case kindArray:
		b.WriteString("z.array(")
		s.elem.write(b, indent)
		b.WriteString(")")

	case kindRecord:
		b.WriteString("z.record(z.string(), ")
		s.elem.write(b, indent)
		b.WriteString(")")

	case kindObject:
		s.writeObject(b, indent)

	case kindUnion:
		b.WriteString("z.union([\n")
		inner := indent + "  "
		for _, v := range s.variants {
			b.WriteString(inner)
			v.schema.write(b, inner)
			b.WriteString(",\n")
		}
		b.WriteString(indent + "])")

	case kindTagged:
		fmt.Fprintf(b, "z.discriminatedUnion(%q, [\n", s.discr)
		inner := indent + "  "
		for _, v := range s.variants {
			b.WriteString(inner)
			v.schema.write(b, inner)
			b.WriteString(",\n")
		}
		b.WriteString(indent + "])")
	}
}

// writeObject prints z.strictObject: a field absent from the schema is something
// the panel does not know, and silence about it is not acceptable. The panel shows
// a node with such a field as unrecognized and edits it as text; the safety of its bytes does not
// depend on the schema, the config is edited by the file text.
func (s *schema) writeObject(b *strings.Builder, indent string) {
	if s.base != "" && len(s.fields) == 0 {
		b.WriteString(s.base)
		return
	}
	if len(s.fields) == 0 {
		b.WriteString("z.strictObject({})")
		return
	}
	// A variant that has a common part is printed as its extension:
	// there is no point in repeating fifty common fields in each variant.
	if s.base != "" {
		fmt.Fprintf(b, "%s.extend({\n", s.base)
	} else {
		b.WriteString("z.strictObject({\n")
	}
	inner := indent + "  "
	for _, f := range s.fields {
		if f.doc != "" {
			fmt.Fprintf(b, "%s/** %s */\n", inner, f.doc)
		}

		// A field with a reference is printed as a getter: it is lazy, so mutual
		// recursion works regardless of the declaration order in the file.
		if f.schema.hasRef() {
			fmt.Fprintf(b, "%sget %s() {\n%s  return ", inner, quoteKey(f.name), inner)
			f.schema.write(b, inner+"  ")
			fmt.Fprintf(b, "%s\n%s},\n", optionalSuffix(f.optional), inner)
			continue
		}
		fmt.Fprintf(b, "%s%s: ", inner, quoteKey(f.name))
		f.schema.write(b, inner)
		b.WriteString(optionalSuffix(f.optional))
		b.WriteString(",\n")
	}
	b.WriteString(indent + "})")
}

func optionalSuffix(optional bool) string {
	if optional {
		return ".optional()"
	}
	return ""
}

// quoteKey leaves the key bare while it is a valid JS identifier.
func quoteKey(name string) string {
	if name == "" {
		return `""`
	}
	for i, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r == '_', r == '$':
		case i > 0 && r >= '0' && r <= '9':
		default:
			return fmt.Sprintf("%q", name)
		}
	}
	return name
}

// named is a named schema in the generator output.
type named struct {
	name   string
	schema *schema
}

type schemaSet struct {
	byName map[string]*named
}

func newSchemaSet() *schemaSet { return &schemaSet{byName: map[string]*named{}} }

func (s *schemaSet) put(name string, node *schema) { s.byName[name] = &named{name, node} }

// sorted returns the schemas in declaration order: first what is referenced
// outside getters. Within one layer, alphabetically, so the file is not reordered
// from run to run.
func (s *schemaSet) sorted() []*named {
	names := make([]string, 0, len(s.byName))
	for name := range s.byName {
		names = append(names, name)
	}
	sort.Strings(names)

	var out []*named
	emitted := map[string]bool{}

	var emit func(name string, path map[string]bool)
	emit = func(name string, path map[string]bool) {
		if emitted[name] || path[name] {
			return
		}
		node, ok := s.byName[name]
		if !ok {
			return
		}
		path[name] = true

		deps := map[string]bool{}
		node.schema.hardRefs(deps)
		depNames := make([]string, 0, len(deps))
		for dep := range deps {
			depNames = append(depNames, dep)
		}
		sort.Strings(depNames)
		for _, dep := range depNames {
			emit(dep, path)
		}

		delete(path, name)
		emitted[name] = true
		out = append(out, node)
	}

	for _, name := range names {
		emit(name, map[string]bool{})
	}
	return out
}
