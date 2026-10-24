package main

import (
	"cmp"
	"fmt"
	"go/format"
	"maps"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// The field reference is a graph for the MCP agent: a node is what a value can be, an
// edge is an object field leading to the node of its value. A named schema is one node
// wherever it appears, so recursive rules and shapes repeated under many node types cost
// nothing extra, and the daemon resolves a path by walking the graph from the root.
type fieldNode struct {
	types   []string
	values  []string
	edges   []fieldEdge
	items   []int // nodes of array elements
	entries []int // nodes of map values
}

type fieldEdge struct {
	name      string
	node      int
	reference string
	when      map[string][]string
	doc       string
}

type fieldGraph struct {
	set     *schemaSet
	nodes   []*fieldNode
	root    int
	byName  map[string]int // named schema -> node
	byShape map[string]int // signature of an anonymous node -> node
	unknown map[string]bool
}

// fieldReference builds the graph from the root.
func fieldReference(set *schemaSet, root *schema) (*fieldGraph, error) {
	g := &fieldGraph{set: set, byName: map[string]int{}, byShape: map[string]int{}, unknown: map[string]bool{}}
	g.root = g.node(root)

	if len(g.unknown) > 0 {
		return nil, fmt.Errorf("scalar expressions the field reference cannot describe: %s",
			strings.Join(slices.Sorted(maps.Keys(g.unknown)), ", "))
	}
	return g, nil
}

// node returns the node of a value, building it on first use. A named schema takes its id
// before its body is built, since rules hold rules; recursion goes only through names, so
// an anonymous value is built whole and shares the id of an identical node.
func (g *fieldGraph) node(s *schema) int {
	if s.kind == kindRef {
		if id, ok := g.byName[s.ref]; ok {
			return id
		}
	}

	types, values := g.describe(s, map[string]bool{})
	n := &fieldNode{types: types, values: values}

	id := -1
	if s.kind == kindRef {
		id = g.add(n)
		g.byName[s.ref] = id
	}

	var forms []*schema
	for _, leaf := range g.leaves(s, map[string]bool{}) {
		switch leaf.kind {
		case kindArray:
			n.items = appendNewInt(n.items, g.node(leaf.elem))
		case kindRecord:
			n.entries = appendNewInt(n.entries, g.node(leaf.elem))
		case kindObject:
			forms = append(forms, leaf)
		default:
		}
	}
	n.edges = g.edges(forms)

	if id >= 0 {
		return id
	}
	return g.shared(n)
}

// shared returns the id of an identical anonymous node, adding this one when there is none.
func (g *fieldGraph) shared(n *fieldNode) int {
	key := n.signature()
	if known, ok := g.byShape[key]; ok {
		return known
	}
	id := g.add(n)
	g.byShape[key] = id
	return id
}

func (n *fieldNode) signature() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%q %q %v %v", n.types, n.values, n.items, n.entries)
	for _, e := range n.edges {
		fmt.Fprintf(&b, " %q %d %q %q", e.name, e.node, e.reference, e.doc)
		for _, k := range sortedKeys(e.when) {
			fmt.Fprintf(&b, " %q=%q", k, e.when[k])
		}
	}
	return b.String()
}

func (g *fieldGraph) add(n *fieldNode) int {
	g.nodes = append(g.nodes, n)
	return len(g.nodes) - 1
}

// edges merges the fields of the object forms of a value. A field whose value has keys
// and differs between forms gives one edge per value, each with the discriminator values
// of its forms; scalar values of one field merge into one node, the discriminator too.
func (g *fieldGraph) edges(forms []*schema) []fieldEdge {
	type group struct {
		edge   fieldEdge
		leaf   bool
		types  []string
		values []string
		forms  []map[string]string
	}

	literals := make([]map[string]string, len(forms))
	var groups []*group
	for i, form := range forms {
		literals[i] = g.literals(form)
		for _, f := range g.fields(form) {
			// Judged by the schema: a node still being built has no edges yet. A scalar
			// value gets its node once the values of every form are known.
			leaf := !keyed(g.leaves(f.schema, map[string]bool{}))
			child := -1
			var types, values []string
			if leaf {
				types, values = g.describe(f.schema, map[string]bool{})
			} else {
				child = g.node(f.schema)
			}
			idx := slices.IndexFunc(groups, func(gr *group) bool {
				return gr.edge.name == f.name && (leaf && gr.leaf || gr.edge.node == child)
			})
			if idx < 0 {
				groups = append(groups, &group{edge: fieldEdge{name: f.name, node: child}, leaf: leaf})
				idx = len(groups) - 1
			}
			gr := groups[idx]
			gr.forms = append(gr.forms, literals[i])
			gr.types = appendNew(gr.types, types...)
			gr.values = appendNew(gr.values, values...)
			gr.edge.reference = cmp.Or(gr.edge.reference, referenceOf(f.schema))
			gr.edge.doc = cmp.Or(gr.edge.doc, f.doc)
		}
	}

	universe := map[string]map[string]bool{}
	for _, lits := range literals {
		for k, v := range lits {
			if universe[k] == nil {
				universe[k] = map[string]bool{}
			}
			universe[k][v] = true
		}
	}

	out := make([]fieldEdge, 0, len(groups))
	for _, gr := range groups {
		if gr.leaf {
			gr.edge.node = g.shared(&fieldNode{types: gr.types, values: gr.values})
		}
		gr.edge.when = condition(gr.forms, universe)
		out = append(out, gr.edge)
	}
	return out
}

// condition names the discriminator values of the forms that have a field. A key some of
// those forms do not fix, or whose every value has the field, puts no condition.
func condition(forms []map[string]string, universe map[string]map[string]bool) map[string][]string {
	out := map[string][]string{}
	for k, all := range universe {
		seen := map[string]bool{}
		fixed := true
		for _, lits := range forms {
			v, ok := lits[k]
			if !ok {
				fixed = false
				break
			}
			seen[v] = true
		}
		if fixed && len(seen) < len(all) {
			out[k] = slices.Sorted(maps.Keys(seen))
		}
	}
	return out
}

// keyed is true when a value with these forms can be an object or a collection of objects.
func keyed(leaves []*schema) bool {
	return slices.ContainsFunc(leaves, func(leaf *schema) bool { return leaf.kind != kindScalar })
}

// leaves flattens references and unions into the forms a value can take. An array or map
// that cannot hold an object has no keys below and counts as a scalar. seen holds the
// schemas on the way down, so a schema made of itself ends.
func (g *fieldGraph) leaves(s *schema, seen map[string]bool) []*schema {
	switch s.kind {
	case kindRef:
		if seen[s.ref] {
			return nil
		}
		node, ok := g.set.byName[s.ref]
		if !ok {
			return nil
		}
		seen[s.ref] = true
		defer delete(seen, s.ref)
		return g.leaves(node.schema, seen)
	case kindUnion, kindTagged:
		var out []*schema
		for _, v := range s.variants {
			out = append(out, g.leaves(v.schema, seen)...)
		}
		return out
	case kindArray, kindRecord:
		if !keyed(g.leaves(s.elem, seen)) {
			return []*schema{{kind: kindScalar}}
		}
		return []*schema{s}
	default:
		return []*schema{s}
	}
}

// fields returns the fields of an object together with those of its base schema.
func (g *fieldGraph) fields(s *schema) []field {
	var out []field
	if s.base != "" {
		if node, ok := g.set.byName[s.base]; ok && node.schema.kind == kindObject {
			out = g.fields(node.schema)
		}
	}
	for _, f := range s.fields {
		out = slices.DeleteFunc(out, func(known field) bool { return known.name == f.name })
		out = append(out, f)
	}
	return out
}

// literals are the discriminator values of an object form: the fields fixed to one value.
func (g *fieldGraph) literals(s *schema) map[string]string {
	out := map[string]string{}
	for _, f := range g.fields(s) {
		if f.schema.kind != kindScalar {
			continue
		}
		if v, ok := literalValue(f.schema.expr); ok {
			out[f.name] = v
		}
	}
	return out
}

// describe names the forms of a value for a reader, with the values an enum or a literal
// allows.
func (g *fieldGraph) describe(s *schema, seen map[string]bool) ([]string, []string) {
	switch s.kind {
	case kindScalar:
		typ, values, ok := describeScalar(s.expr)
		if !ok {
			g.unknown[s.expr] = true
		}
		return []string{typ}, values
	case kindRef:
		node, ok := g.set.byName[s.ref]
		if !ok || seen[s.ref] {
			return []string{"object"}, nil
		}
		seen[s.ref] = true
		defer delete(seen, s.ref)
		return g.describe(node.schema, seen)
	case kindObject:
		return []string{"object"}, nil
	case kindArray, kindRecord:
		prefix := "array of "
		if s.kind == kindRecord {
			prefix = "map of "
		}
		elems, values := g.describe(s.elem, seen)
		types := make([]string, 0, len(elems))
		for _, elem := range elems {
			types = append(types, prefix+elem)
		}
		return []string{strings.Join(types, " | ")}, values
	case kindUnion, kindTagged:
		var types, values []string
		for _, v := range s.variants {
			t, vs := g.describe(v.schema, seen)
			types = appendNew(types, t...)
			values = appendNew(values, vs...)
		}
		return types, values
	}
	return []string{"unknown"}, nil
}

var (
	enumPattern    = regexp.MustCompile(`^z\.enum\(\[(.*)\]\)$`)
	literalPattern = regexp.MustCompile(`^z\.literal\((.*)\)$`)
)

// describeScalar reads back the Zod expressions the walker prints for leaves.
func describeScalar(expr string) (string, []string, bool) {
	switch expr {
	case "z.string()":
		return "string", nil, true
	case "z.boolean()":
		return "boolean", nil, true
	case "z.int()":
		return "integer", nil, true
	case "z.int().nonnegative()":
		return "integer >= 0", nil, true
	case "z.number()":
		return "number", nil, true
	case "z.unknown()":
		return "any JSON", nil, true
	case durationSchema().expr:
		return "duration string (30s, 1h30m, 1d)", nil, true
	}
	if m := enumPattern.FindStringSubmatch(expr); m != nil {
		var values []string
		for item := range strings.SplitSeq(m[1], ", ") {
			v, err := strconv.Unquote(item)
			if err != nil {
				return "", nil, false
			}
			values = append(values, v)
		}
		return "enum", values, true
	}
	// A discriminator is one literal per object form; over the forms of a value it reads as
	// an enum.
	if v, ok := literalValue(expr); ok {
		if !strings.HasPrefix(expr, `z.literal("`) {
			return "integer enum", []string{v}, true
		}
		return "enum", []string{v}, true
	}
	return "", nil, false
}

func literalValue(expr string) (string, bool) {
	m := literalPattern.FindStringSubmatch(expr)
	if m == nil {
		return "", false
	}
	if v, err := strconv.Unquote(m[1]); err == nil {
		return v, true
	}
	return m[1], true
}

// referenceOf returns the node kind a value names by its tag, looking into its list form.
func referenceOf(s *schema) string {
	if s.reference != "" {
		return s.reference
	}
	switch s.kind {
	case kindArray:
		return referenceOf(s.elem)
	case kindUnion, kindTagged:
		for _, v := range s.variants {
			if kind := referenceOf(v.schema); kind != "" {
				return kind
			}
		}
	default:
	}
	return ""
}

func appendNew(into []string, items ...string) []string {
	for _, item := range items {
		if !slices.Contains(into, item) {
			into = append(into, item)
		}
	}
	return into
}

func appendNewInt(into []int, item int) []int {
	if !slices.Contains(into, item) {
		into = append(into, item)
	}
	return into
}

const fieldsHeader = `// Code generated by tools/schemagen from sing-box-extended %s. DO NOT EDIT.
// Rebuilt by ` + "`make schema`" + `; notes the agent gets with a field live in fieldnotes.json.

package mcp

// fieldForkVersion is the fork version the field reference is built from.
const fieldForkVersion = %q

`

// emitFields prints the field graph as a Go source of the daemon's MCP package: static
// data indexed by node id.
func emitFields(g *fieldGraph, version string) (string, error) {
	var b strings.Builder
	fmt.Fprintf(&b, fieldsHeader, version, version)
	fmt.Fprintf(&b, "// fieldRoot is the node of the whole config.\nconst fieldRoot = %d\n\n", g.root)

	b.WriteString("var fieldNodes = []fieldNode{\n")
	for id, n := range g.nodes {
		fmt.Fprintf(&b, "%d: {Type: %q", id, strings.Join(n.types, " | "))
		if len(n.values) > 0 {
			fmt.Fprintf(&b, ", Values: %s", goList(n.values))
		}
		if len(n.items) > 0 {
			fmt.Fprintf(&b, ", Items: %s", goInts(n.items))
		}
		if len(n.entries) > 0 {
			fmt.Fprintf(&b, ", Entries: %s", goInts(n.entries))
		}
		if len(n.edges) > 0 {
			b.WriteString(", Fields: []fieldEdge{\n")
			for _, e := range n.edges {
				fmt.Fprintf(&b, "{Name: %q, Node: %d", e.name, e.node)
				if e.reference != "" {
					fmt.Fprintf(&b, ", Reference: %q", e.reference)
				}
				if len(e.when) > 0 {
					b.WriteString(", When: []fieldCondition{")
					for _, k := range sortedKeys(e.when) {
						fmt.Fprintf(&b, "{%q, %s}, ", k, goList(e.when[k]))
					}
					b.WriteString("}")
				}
				if e.doc != "" {
					fmt.Fprintf(&b, ", Doc: %q", e.doc)
				}
				b.WriteString("},\n")
			}
			b.WriteString("}")
		}
		b.WriteString("},\n")
	}
	b.WriteString("}\n")

	src, err := format.Source([]byte(b.String()))
	if err != nil {
		return "", fmt.Errorf("formatting the field reference: %w", err)
	}
	return string(src), nil
}

func goList(items []string) string {
	quoted := make([]string, 0, len(items))
	for _, item := range items {
		quoted = append(quoted, strconv.Quote(item))
	}
	return "[]string{" + strings.Join(quoted, ", ") + "}"
}

func goInts(items []int) string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, strconv.Itoa(item))
	}
	return "[]int32{" + strings.Join(out, ", ") + "}"
}
