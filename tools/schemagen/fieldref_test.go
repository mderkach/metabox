package main

import (
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func generate() (string, error) {
	out, err := generateBoth()
	if err != nil {
		return "", err
	}
	return out.schema, nil
}

func generateFields() (string, error) {
	out, err := generateBoth()
	if err != nil {
		return "", err
	}
	return out.fields, nil
}

// The daemon serves the committed reference: a generator change without `make schema`
// would leave the agent on the old schema.
func TestFieldReferenceIsCommitted(t *testing.T) {
	out, err := generateFields()
	if err != nil {
		t.Fatal(err)
	}

	committed, err := os.ReadFile("../../apps/metaboxd/internal/mcp/fields.generated.go")
	if err != nil {
		t.Fatal(err)
	}

	if out != string(committed) {
		t.Error("fields.generated.go differs from the generator output, run make schema")
	}
}

func TestFieldReferenceDescribesFields(t *testing.T) {
	out, err := generateFields()
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		`\{Name: "final", Node: \d+, Reference: "outbound"\}`,
		`\{Name: "flow", Node: \d+, When: \[\]fieldCondition\{\{"type", \[\]string\{"vless"\}\}\}\}`,
		`\{Name: "outbound", Node: \d+, Reference: "outbound", When: \[\]fieldCondition\{\{"action", \[\]string\{"bypass", "route"\}\}\}\}`,
		`\{Type: "integer enum", Values: \[\]string\{"0", "1", "2", "3"\}\}`,
		`\{Name: "geosite", Node: \d+, When: \[\]fieldCondition\{\{"type", \[\]string\{"default"\}\}\}, Doc: "Deprecated: removed in sing-box 1.12.0"\}`,
	} {
		if !regexp.MustCompile(want).MatchString(out) {
			t.Errorf("field reference lacks %s", want)
		}
	}
}

func TestFieldReferenceGraph(t *testing.T) {
	set := newSchemaSet()
	// A group holds nodes, a bond holds members that hold a node: the same key leads to two
	// different values, and the node refers to itself.
	set.put("NodeSchema", union(
		&schema{kind: kindObject, fields: []field{
			{name: "type", schema: scalar(`z.literal("group")`)},
			{name: "members", schema: array(ref("NodeSchema"))},
		}},
		&schema{kind: kindObject, fields: []field{
			{name: "type", schema: scalar(`z.literal("bond")`)},
			{name: "members", schema: array(ref("MemberSchema"))},
		}},
		&schema{kind: kindObject, fields: []field{
			{name: "type", schema: scalar(`z.literal("plain")`)},
			{name: "tag", schema: scalar("z.string()")},
		}},
	))
	set.put("MemberSchema", &schema{kind: kindObject, fields: []field{
		{name: "weight", schema: scalar("z.int()")},
		{name: "node", schema: ref("NodeSchema")},
	}})
	root := &schema{kind: kindObject, fields: []field{
		{name: "list", schema: array(ref("NodeSchema"))},
		{name: "one", schema: listable(ref("MemberSchema"))},
	}}

	g, err := fieldReference(set, root)
	if err != nil {
		t.Fatal(err)
	}

	nodeID := g.byName["NodeSchema"]
	node := g.nodes[nodeID]

	var members []fieldEdge
	for _, e := range node.edges {
		if e.name == "members" {
			members = append(members, e)
		}
	}
	if len(members) != 2 {
		t.Fatalf("members edges %+v, want one per value", members)
	}

	group := g.nodes[members[0].node]
	if !reflect.DeepEqual(group.items, []int{nodeID}) || !reflect.DeepEqual(members[0].when, map[string][]string{"type": {"group"}}) {
		t.Errorf("group members lead to %v when %v, want the node itself under type group", group.items, members[0].when)
	}

	bond := g.nodes[members[1].node]
	if len(bond.items) != 1 || bond.items[0] != g.byName["MemberSchema"] {
		t.Errorf("bond members lead to %v, want the member node", bond.items)
	}

	// A single object or a list of them: both the keys and the elements are reachable.
	one := g.nodes[g.nodes[g.root].edges[1].node]
	if len(one.items) != 1 || one.items[0] != g.byName["MemberSchema"] || len(one.edges) != 2 {
		t.Errorf("listable member has items %v and %d keys, want the member node and its two keys", one.items, len(one.edges))
	}

	for _, e := range node.edges {
		if e.name == "type" && len(e.when) != 0 {
			t.Errorf("the discriminator has a condition %v", e.when)
		}
	}
}

// A form without the discriminator says nothing about it: no condition, and never an
// empty list of values.
func TestFieldConditionSkipsUnfixedForms(t *testing.T) {
	universe := map[string]map[string]bool{"type": {"a": true, "b": true}}

	if got := condition([]map[string]string{{"type": "a"}, {}}, universe); len(got) != 0 {
		t.Errorf("condition %v for a field in an untyped form, want none", got)
	}

	if got := condition([]map[string]string{{"type": "a"}}, universe); !reflect.DeepEqual(got, map[string][]string{"type": {"a"}}) {
		t.Errorf("condition %v, want type a", got)
	}
}

// A leaf the reference cannot name must stop generation rather than reach the agent as
// an empty type.
func TestFieldReferenceRejectsUnknownScalar(t *testing.T) {
	root := &schema{kind: kindObject, fields: []field{{name: "size", schema: scalar("z.bigint()")}}}

	_, err := fieldReference(newSchemaSet(), root)
	if err == nil || !strings.Contains(err.Error(), "z.bigint()") {
		t.Errorf("unknown scalar not reported: %v", err)
	}
}
