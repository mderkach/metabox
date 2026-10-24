package main

import (
	"fmt"
	"slices"
	"strings"
)

// The fork marks a field whose value names another node by its tag with the struct tag
// `reference:"outbound"`, and a type whose short string form is such a name declares it in
// DescribeSchema with schema.TagReferenceNode. Reflection does not see DescribeSchema, so
// the short forms are repeated here.
var shorthandReference = map[string]string{
	"option.DomainResolveOptions": "dns_server",
	"option.HTTPClientOptions":    "http_client",
}

// referenceTable is where a config names nodes by tag. A path is a list of JSON keys,
// `*` stands for an array index and `{}` for a map key.
type referenceTable struct {
	paths [][]string
	loops []referenceLoop
}

// referenceLoop is a recursive shape: a logical rule holds rules, a bond outbound holds
// outbounds. A path that starts with from continues as if it started with to.
type referenceLoop struct {
	from []string
	to   []string
}

type referenceWalk struct {
	set   *schemaSet
	stack map[string][]string // schemas being walked -> the path they were entered at
	paths map[string][]string
	loops map[string]referenceLoop
}

// tagReferences walks the schema from the root and collects the paths of marked values.
func tagReferences(set *schemaSet, root *schema) referenceTable {
	w := &referenceWalk{
		set:   set,
		stack: map[string][]string{},
		paths: map[string][]string{},
		loops: map[string]referenceLoop{},
	}
	w.walk(root, nil)

	var table referenceTable
	for _, key := range sortedKeys(w.paths) {
		table.paths = append(table.paths, w.paths[key])
	}
	for _, key := range sortedKeys(w.loops) {
		table.loops = append(table.loops, w.loops[key])
	}
	return table
}

func (w *referenceWalk) walk(s *schema, path []string) {
	if s.reference != "" {
		w.paths[strings.Join(path, ".")] = path
		return
	}

	switch s.kind {
	case kindScalar:
	case kindRef:
		w.enter(s.ref, path)
	case kindArray:
		w.walk(s.elem, append(slices.Clone(path), "*"))
	case kindRecord:
		w.walk(s.elem, append(slices.Clone(path), "{}"))
	case kindUnion, kindTagged:
		for _, v := range s.variants {
			w.walk(v.schema, path)
		}
	case kindObject:
		if s.base != "" {
			w.enter(s.base, path)
		}
		for _, f := range s.fields {
			w.walk(f.schema, append(slices.Clone(path), f.name))
		}
	}
}

func (w *referenceWalk) enter(name string, path []string) {
	if at, ok := w.stack[name]; ok {
		if !slices.Equal(at, path) {
			w.loops[strings.Join(path, ".")] = referenceLoop{from: path, to: at}
		}
		return
	}

	node, ok := w.set.byName[name]
	if !ok {
		return
	}

	w.stack[name] = path
	w.walk(node.schema, path)
	delete(w.stack, name)
}

func emitTagReferences(b *strings.Builder, table referenceTable) {
	b.WriteString(`/**
 * Config paths whose value names a node by its tag, as the fork marks them. ` + "`*`" + ` is an array
 * index, ` + "`{}`" + ` a map key; the value is a tag or a list of tags.
 */
export const TAG_REFERENCE_PATHS: readonly (readonly string[])[] = [
`)
	for _, path := range table.paths {
		fmt.Fprintf(b, "  %s,\n", jsonList(path))
	}
	b.WriteString(`]

/** Recursive shapes: a path that starts with ` + "`from`" + ` continues as if it started with ` + "`to`" + `. */
export const TAG_REFERENCE_LOOPS: readonly { readonly from: readonly string[]; readonly to: readonly string[] }[] = [
`)
	for _, loop := range table.loops {
		fmt.Fprintf(b, "  { from: %s, to: %s },\n", jsonList(loop.from), jsonList(loop.to))
	}
	b.WriteString("]\n\n")
}

func jsonList(items []string) string {
	quoted := make([]string, 0, len(items))
	for _, item := range items {
		quoted = append(quoted, fmt.Sprintf("%q", item))
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}
