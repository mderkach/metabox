package main

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/sagernet/sing-box/option"
)

// The schema must build whole: any type with its own serialization and no
// rule aborts generation, so a successful run is itself the check
// of override table completeness.
func TestGenerate(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		"export const ConfigSchema",
		"export const InboundSchema",
		"export const OutboundSchema",
		"export const DnsSchema",
		"export type Config",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("schema lacks %q", want)
		}
	}

	// A transform turns ZodObject into ZodPipe: .extend, .omit and
	// .pick, on which the rule schema is built, disappear, and z.toJSONSchema stops
	// printing the output side, so the auto-renderer would get an empty node instead of a field
	//.
	if strings.Contains(out, ".transform(") {
		t.Error("the generated schema has .transform(): .extend and z.toJSONSchema break")
	}
}

// Fork field descriptions reach the schema: hints are seen by both the developer and
// the auto-renderer of uncovered nodes (Form&Validation).
func TestGenerateCarriesDocs(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatalf("generation: %v", err)
	}

	if !strings.Contains(out, "/** Deprecated:") {
		t.Error("the schema has no field description: the fork godoc was not read")
	}
}

// Embedded structs are flattened inside a union by discriminator too. In
// the HTTP client the connection set and TLS settings come by embedding, and without
// them the strict schema would reject a config with `http_client.detour`, and the panel
// would mark such a node as uncovered.
func TestGenerateFlattensEmbeddedInTaggedUnion(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatal(err)
	}

	body := schemaBody(t, out, "HTTPClientSchema")

	for _, want := range []string{"detour:", "bind_interface:", "get tls()"} {
		if !strings.Contains(body, want) {
			t.Errorf("HTTPClientSchema lacks %q: embedded fields are lost", want)
		}
	}
}

// schemaBody cuts out a schema declaration by name: searching a substring over the whole
// file is pointless, the same fields exist in dozens of other types.
func schemaBody(t *testing.T, out, name string) string {
	t.Helper()

	const marker = "\nexport const "

	start := strings.Index(out, marker+name+" = ")
	if start == -1 {
		t.Fatalf("schema lacks %s", name)
	}

	rest := out[start+len(marker):]

	end := strings.Index(rest, marker)
	if end == -1 {
		return rest
	}

	return rest[:end]
}

// Generation must be deterministic: otherwise make schema gives a different
// file on the same fork and the diff stops meaning anything.
func TestGenerateIsStable(t *testing.T) {
	first, err := generate()
	if err != nil {
		t.Fatal(err)
	}
	second, err := generate()
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Error("two generator runs gave different results")
	}
}

// Config examples from the fork are a ready corpus for checking that the schema
// accepts real configs. The test only collects the list: parsing
// happens on the frontend side, where the schema is executed.
func TestForkExamplesArePresent(t *testing.T) {
	dir, err := forkDir()
	if err != nil {
		t.Fatal(err)
	}

	var configs []string
	err = filepath.WalkDir(filepath.Join(dir, "examples"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && filepath.Ext(path) == ".json" {
			configs = append(configs, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(configs) == 0 {
		t.Fatal("no config examples found in the fork")
	}
	t.Logf("config examples in the fork: %d", len(configs))
}

// The panel looks for references to a node only in fields the fork marks with
// `reference`: a field that merely holds the same string is not a reference.
func TestGenerateMarksTagReferences(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		`["route", "rules", "*", "outbound"]`,
		`["route", "rules", "*", "rule_set"]`,
		`["route", "final"]`,
		`["outbounds", "*", "outbounds"]`,
		`["dns", "rules", "*", "server"]`,
		// A short form declared by the fork's DescribeSchema, not by a struct tag.
		`["outbounds", "*", "domain_resolver"]`,
		// Fields the fork leaves unmarked, from unmarkedReferences.
		`["outbounds", "*", "providers"]`,
		`["providers", "*", "download_detour"]`,
		`["dns", "servers", "*", "servers"]`,
		`["experimental", "v2ray_api", "stats", "outbounds"]`,
		`["services", "*", "inbounds"]`,
		`{ from: ["route", "rules", "*", "rules", "*"], to: ["route", "rules", "*"] }`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("tag references lack %s", want)
		}
	}

	for _, unwanted := range []string{`["outbounds", "*", "server"]`, `["outbounds", "*", "tag"]`} {
		if strings.Contains(out, unwanted) {
			t.Errorf("tag references list %s, which is not a reference", unwanted)
		}
	}
}

// A listed field the fork removed must stop generation, not quietly drop its references.
func TestUnmarkedReferencesFailOnMissingField(t *testing.T) {
	saved := unmarkedReferences
	t.Cleanup(func() { unmarkedReferences = saved })

	if err := checkUnmarkedReferences(); err != nil {
		t.Fatalf("the table does not match the fork: %v", err)
	}

	unmarkedReferences = append(slices.Clone(saved), unmarkedField{reflect.TypeFor[option.FallbackOutboundOptions](), "Gone", "outbound"})

	err := checkUnmarkedReferences()
	if err == nil || !strings.Contains(err.Error(), "option.FallbackOutboundOptions.Gone") {
		t.Errorf("missing field not reported: %v", err)
	}
}
