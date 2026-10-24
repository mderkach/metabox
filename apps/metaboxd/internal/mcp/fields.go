package mcp

import (
	"cmp"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"

	"metabox/internal/locale"
)

// fieldNode is what a config value can be, in the field reference generated from the fork
// schema: a named schema is one node wherever it appears.
type fieldNode struct {
	// Type names the forms the value takes, joined by " | ".
	Type string
	// Values are what an enum or a discriminator allows.
	Values []string
	// Fields are the keys of its object forms. A key whose value differs between forms has
	// one edge per value.
	Fields []fieldEdge
	// Items and Entries are the nodes of array elements and map values that can hold an
	// object.
	Items   []int32
	Entries []int32
}

type fieldEdge struct {
	Name string
	Node int32
	// Reference is the kind of node the value names by its tag.
	Reference string
	// When holds the discriminator values of the forms that have the key; empty means
	// every form has it. A slice rather than a map keeps the reference static data.
	When []fieldCondition
	Doc  string
}

type fieldCondition struct {
	Key    string
	Values []string
}

// fieldNotes are hand-written notes keyed by a config path, then by language: what the
// schema cannot say, such as what a field matches or how sing-box behaves around it.
//
//go:embed fieldnotes.json
var fieldNotes []byte

// fieldStep is one node a path reached, with the discriminator conditions met on the way.
type fieldStep struct {
	node   int32
	conds  []condition
	parent int32 // -1 for the root
	key    string
	// edge is the key that led here; nil for array elements and map values.
	edge *fieldEdge
}

// condition says which values a discriminator has at a path for the value to exist.
type condition struct {
	Path   string   `json:"path"`
	Key    string   `json:"key"`
	Values []string `json:"values"`
}

// fieldIndex resolves paths over the generated graph. A note is keyed by the node and key
// that lead to its path, so it follows its field into recursive and shared shapes.
type fieldIndex struct {
	notes map[noteKey]map[locale.Lang]string
	// err is a note file the reference does not match; the tool reports it on call.
	err error
}

type noteKey struct {
	parent int32
	key    string
}

func newFieldIndex() fieldIndex {
	x := fieldIndex{notes: map[noteKey]map[locale.Lang]string{}}

	var notes map[string]map[locale.Lang]string
	if err := json.Unmarshal(fieldNotes, &notes); err != nil {
		x.err = fmt.Errorf("parse field notes: %w", err)

		return x
	}

	for _, path := range slices.Sorted(maps.Keys(notes)) {
		_, steps, err := x.resolve(path)
		if err != nil {
			x.err = fmt.Errorf("field note %q: %w", path, err)

			return x
		}

		for _, st := range steps {
			key := noteKey{st.parent, st.key}
			if prev, taken := x.notes[key]; taken && !maps.Equal(prev, notes[path]) {
				x.err = fmt.Errorf("field note %q lands on a field another note already has", path)

				return x
			}

			x.notes[key] = notes[path]
		}
	}

	return x
}

// resolve walks a path as the agent writes it: a number is an array index, and a key is
// read both as an object key and as a map key. It returns the path with `*` and `{}` and
// every node it reached.
func (fieldIndex) resolve(path string) (string, []fieldStep, error) {
	steps := []fieldStep{{node: fieldRoot, parent: -1}}

	if path == "" {
		return "", steps, nil
	}

	var walked []string

	for seg := range strings.SplitSeq(path, ".") {
		candidates := []string{seg, "{}"}
		if isIndex(seg) {
			candidates = []string{"*", "{}"}
		}

		var (
			next  []fieldStep
			taken string
		)

		for _, c := range candidates {
			if more := advance(steps, c, strings.Join(walked, ".")); len(more) > 0 {
				next = append(next, more...)
				taken = cmp.Or(taken, c)
			}
		}

		if len(next) == 0 {
			if len(walked) == 0 {
				return "", nil, locale.Errorf("%w: the config has no top-level key %q", errBadInput, seg)
			}

			at := strings.Join(walked, ".")

			return "", nil, locale.Errorf("%w: %q has no key %q; call with path %q to list its keys", errBadInput, at, seg, at)
		}

		walked = append(walked, taken)
		steps = next
	}

	return strings.Join(walked, "."), steps, nil
}

// advance takes one key from every reached node and merges what it leads to by node.
func advance(steps []fieldStep, key, at string) []fieldStep {
	var next []fieldStep

	add := func(st fieldStep) {
		i := slices.IndexFunc(next, func(known fieldStep) bool { return known.node == st.node })
		if i < 0 {
			next = append(next, st)

			return
		}

		next[i].conds = mergeConditions(next[i].conds, st.conds)
	}

	for _, st := range steps {
		n := &fieldNodes[st.node]

		if key == "*" || key == "{}" {
			targets := n.Items
			if key == "{}" {
				targets = n.Entries
			}

			for _, t := range targets {
				add(fieldStep{node: t, conds: st.conds, parent: st.node, key: key})
			}

			continue
		}

		for i := range n.Fields {
			e := &n.Fields[i]
			if e.Name != key {
				continue
			}

			conds := slices.Clone(st.conds)
			for _, c := range e.When {
				conds = append(conds, condition{Path: at, Key: c.Key, Values: c.Values})
			}

			add(fieldStep{node: e.Node, conds: conds, parent: st.node, key: key, edge: e})
		}
	}

	return next
}

// mergeConditions keeps what holds on both ways to a value: a condition one way lacks
// puts none, and the values of the two ways add up.
func mergeConditions(a, b []condition) []condition {
	var out []condition

	for _, ca := range a {
		for _, cb := range b {
			if ca.Path != cb.Path || ca.Key != cb.Key {
				continue
			}

			values := appendMissing(slices.Clone(ca.Values), cb.Values...)
			slices.Sort(values)
			out = append(out, condition{Path: ca.Path, Key: ca.Key, Values: values})
		}
	}

	return out
}

func isIndex(seg string) bool {
	if seg == "" {
		return false
	}

	for _, r := range seg {
		if r < '0' || r > '9' {
			return false
		}
	}

	return true
}

func appendMissing(into []string, items ...string) []string {
	for _, item := range items {
		if !slices.Contains(into, item) {
			into = append(into, item)
		}
	}

	return into
}

type fieldIn struct {
	Path string `json:"path,omitempty" jsonschema:"config path as dot-separated JSON keys, for example route.rules.0.outbound or dns.servers.*.type; an array index may be a number or *; empty lists the top-level keys"`
}

type fieldOut struct {
	// Path is the input with array indices as * and map keys as {}.
	Path      string   `json:"path"`
	Type      string   `json:"type"`
	Values    []string `json:"values,omitempty"`
	Reference string   `json:"reference,omitempty"`
	// When are the discriminator values along the path the value needs, such as type
	// vless of the outbound it sits in.
	When []condition `json:"when,omitempty"`
	Doc  string      `json:"doc,omitempty"`
	Note string      `json:"note,omitempty"`
	// Keys are the keys under the path: object fields, `*` for array elements, `{}` for
	// map values.
	Keys          []string `json:"keys,omitempty"`
	SchemaVersion string   `json:"schema_version"`
}

func (t tools) field(_ context.Context, in fieldIn) (fieldOut, error) {
	if t.fields.err != nil {
		return fieldOut{}, t.fields.err
	}

	path, steps, err := t.fields.resolve(strings.Trim(strings.TrimSpace(in.Path), "."))
	if err != nil {
		return fieldOut{}, err
	}

	out := fieldOut{Path: path, When: steps[0].conds, SchemaVersion: fieldForkVersion}

	var types []string

	keys := map[string]bool{}

	for i, st := range steps {
		n := &fieldNodes[st.node]
		types = appendMissing(types, strings.Split(n.Type, " | ")...)
		out.Values = appendMissing(out.Values, n.Values...)

		if i > 0 {
			out.When = mergeConditions(out.When, st.conds)
		}

		if st.edge != nil {
			out.Reference = cmp.Or(out.Reference, st.edge.Reference)
			out.Doc = cmp.Or(out.Doc, st.edge.Doc)
		}

		note := t.fields.notes[noteKey{st.parent, st.key}]
		out.Note = cmp.Or(out.Note, note[t.opts.Lang], note[locale.English])

		for _, e := range n.Fields {
			keys[e.Name] = true
		}

		if len(n.Items) > 0 {
			keys["*"] = true
		}

		if len(n.Entries) > 0 {
			keys["{}"] = true
		}
	}

	out.Type = strings.Join(types, " | ")
	out.Keys = slices.Sorted(maps.Keys(keys))

	return out, nil
}
