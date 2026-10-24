package main

import (
	"fmt"
	"reflect"
	"slices"
	"strings"

	"github.com/sagernet/sing-box/option"
)

// The fork marks a field whose value names another node by its tag with the struct tag
// `reference:"outbound"`, and a type whose short string form is such a name declares it in
// DescribeSchema with schema.TagReferenceNode. Reflection does not see DescribeSchema, so
// the short forms are repeated here.
var shorthandReference = map[string]string{
	"option.DomainResolveOptions": "dns_server",
	"option.HTTPClientOptions":    "http_client",
}

// unmarkedReferences are the fork fields that name nodes by tag but carry no `reference`
// struct tag. Types are listed as values so that the compiler and checkUnmarkedReferences
// catch a field the fork removes: a stale entry would silently hide references again.
var unmarkedReferences = []unmarkedField{
	{reflect.TypeFor[option.FallbackOutboundOptions](), "Outbounds", "outbound"},
	{reflect.TypeFor[option.FairQueueOutboundOptions](), "Outbound", "outbound"},
	{reflect.TypeFor[option.GroupCommonOption](), "Providers", "provider"},
	{reflect.TypeFor[option.ProviderRemoteOptions](), "DownloadDetour", "outbound"},
	{reflect.TypeFor[option.CloudflareProfile](), "Detour", "outbound"},
	{reflect.TypeFor[option.V2RayXHTTPDownloadOptions](), "Detour", "outbound"},
	{reflect.TypeFor[option.FallbackDNSServerOptions](), "Servers", "dns_server"},
	{reflect.TypeFor[option.V2RayStatsServiceOptions](), "Inbounds", "inbound"},
	{reflect.TypeFor[option.V2RayStatsServiceOptions](), "Outbounds", "outbound"},
	{reflect.TypeFor[option.NodeServiceOptions](), "Inbounds", "inbound"},
	{reflect.TypeFor[option.ManagerServiceOptions](), "Inbounds", "inbound"},
}

type unmarkedField struct {
	typ   reflect.Type
	field string
	kind  string
}

// unmarkedReference returns the reference kind of an unmarked fork field, or "".
func unmarkedReference(t reflect.Type, field string) string {
	for _, u := range unmarkedReferences {
		if u.typ == t && u.field == field {
			return u.kind
		}
	}
	return ""
}

func checkUnmarkedReferences() error {
	var missing []string
	for _, u := range unmarkedReferences {
		if _, ok := u.typ.FieldByName(u.field); !ok {
			missing = append(missing, goTypeName(u.typ)+"."+u.field)
		}
	}
	if missing != nil {
		return fmt.Errorf("fields of the unmarked reference table are gone from the fork: %s", strings.Join(missing, ", "))
	}
	return nil
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
