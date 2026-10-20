package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// moduleRoot is the module root relative to the test directory.
const moduleRoot = "../.."

// TestGenerateSample covers type translation: a mechanical snake→camel breaks on
// an already-camel tag and on an abbreviation, and optionality comes both from
// omitempty and from a pointer.
func TestGenerateSample(t *testing.T) {
	out, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Sample"}})
	if err != nil {
		t.Fatalf("generation: %v", err)
	}

	tests := []struct {
		name string
		want string
	}{
		{"snake stays as in the tag", "snake_field: z.string(),"},
		{"an already-camel tag is left alone", "lastError: z.string().optional(),"},
		{"abbreviation is preserved", "sourceIP: z.string(),"},
		{"pointer is optional", "pointer: NestedSchema.optional(),"},
		{"struct by value is required", "required: NestedSchema,"},
		{"list", "list: z.array(z.string()),"},
		{"dictionary", "dictionary: z.record(z.string(), NestedSchema),"},
		{"duration is a number of nanoseconds", "window: z.int(),"},
		{"time is a string", "moment: z.string(),"},
		{"raw message", "raw: z.unknown(),"},
		{"type over a string", "phase: z.string(),"},
		{"integer", "count: z.int(),"},
		{"fractional", "ratio: z.number(),"},
		{"flag", "flag: z.boolean(),"},
		{"nested schema is declared before the owner", "export const NestedSchema"},
		{"field godoc goes into JSDoc", "/** Value is a field with a comment: it goes into JSDoc. */"},
		{"type is inferred from the schema", "export type SampleWire = z.infer<typeof SampleSchema>"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !strings.Contains(out, tt.want) {
				t.Errorf("schema lacks %q", tt.want)
			}
		})
	}

	for _, unwanted := range []string{"Hidden", "Untagged"} {
		if strings.Contains(out, unwanted) {
			t.Errorf("field %q does not go outside but got into the schema", unwanted)
		}
	}

	if strings.Index(out, "export const NestedSchema") > strings.Index(out, "export const SampleSchema") {
		t.Error("schema is declared later than it is referenced")
	}
}

// Namesakes from different packages are different enums. Merging them means silently
// replacing one with the other, and an identical constant name would not let the artifact build.
func TestGenerateSeparatesSameNamedEnums(t *testing.T) {
	out, err := generate("testdata", []rootType{
		{pkg: "internal/sample", name: "Tagged"},
		{pkg: "internal/twin", name: "Holder"},
	})
	if err != nil {
		t.Fatalf("generation: %v", err)
	}

	for _, want := range []string{
		"export const SAMPLE_KIND = [\n  'first',\n  'second',\n] as const",
		"export const TWIN_KIND = [\n  'other',\n] as const",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("schema lacks %q", want)
		}
	}

	if strings.Contains(out, "export const KIND") {
		t.Error("namesakes are not separated: the constant name stayed shared")
	}
}

// The values of a named type go out as a list, and a constant without a type is not a member of
// the enum: attributing it to a neighbour means inventing a value the type does not
// have.
func TestGenerateEmitsEnumValues(t *testing.T) {
	out, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Tagged"}})
	if err != nil {
		t.Fatalf("generation: %v", err)
	}

	if want := "export const KIND = [\n  'first',\n  'second',\n] as const"; !strings.Contains(out, want) {
		t.Errorf("schema lacks %q", want)
	}

	if strings.Contains(out, "loose") {
		t.Error("a constant without a type got into the enum")
	}

	// The field stays a string: an unfamiliar value is read by the adapter and does not
	// reject the parse.
	if want := "kind: z.string(),"; !strings.Contains(out, want) {
		t.Errorf("enum field is not described as a string: lacks %q", want)
	}
}

// An enum from a foreign package is printed with the same list as an own one: a field
// that refers to it must not stop generation.
func TestGenerateEmitsForeignEnum(t *testing.T) {
	out, err := generate("testdata", []rootType{{pkg: "internal/twin", name: "Borrower"}})
	if err != nil {
		t.Fatalf("generation: %v", err)
	}

	if want := "export const KIND = [\n  'first',\n  'second',\n] as const"; !strings.Contains(out, want) {
		t.Errorf("schema lacks %q", want)
	}
}

// TestGenerateIsStable: two runs on one tree give one file, otherwise
// `make schema-daemon` makes noise in the diff without daemon changes.
func TestGenerateIsStable(t *testing.T) {
	first, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Sample"}})
	if err != nil {
		t.Fatalf("first run: %v", err)
	}

	second, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Sample"}})
	if err != nil {
		t.Fatalf("second run: %v", err)
	}

	if first != second {
		t.Error("two runs gave different files")
	}
}

// TestGenerateContract: the daemon contract itself is taken whole and contains
// the shapes the panel stands on.
func TestGenerateContract(t *testing.T) {
	out, err := generate(moduleRoot, roots)
	if err != nil {
		t.Fatalf("contract generation: %v", err)
	}

	for _, want := range []string{
		"export const StatusSchema",
		"export const ConnectionsSnapshotSchema",
		"export const ExplanationSchema",
		"export const TransactionSchema",
		"export const VersionsSchema",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("contract lacks %q", want)
		}
	}
}

// TestGeneratedFileIsFresh catches an artifact built on a previous contract:
// pre-commit checks the same, but it can be turned off locally.
func TestGeneratedFileIsFresh(t *testing.T) {
	path := filepath.Join(moduleRoot, "..", "web", "src", "shared", "api", "daemon.generated.ts")

	stored, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("no artifact: %v", err)
	}

	fresh, err := generate(moduleRoot, roots)
	if err != nil {
		t.Fatalf("generation: %v", err)
	}

	if string(stored) != fresh {
		t.Error("apps/web/src/shared/api/daemon.generated.ts not built from the current contract: `make schema-daemon`")
	}
}

func TestConstantName(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"ErrorCode", "ERROR_CODE"},
		{"Level", "LEVEL"},
		{"MCPPermission", "MCP_PERMISSION"},
		{"RuntimeSource", "RUNTIME_SOURCE"},
	}

	for _, tt := range tests {
		if got := constantName(tt.in); got != tt.want {
			t.Errorf("constantName(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
