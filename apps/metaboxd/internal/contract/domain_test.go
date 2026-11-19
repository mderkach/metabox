package contract_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// mirrored are the domain types contract copies, by the package that owns them.
var mirrored = map[string][]string{
	"apply":     {"Phase", "ReasonCode", "Transaction"},
	"config":    {"Version", "ListStat"},
	"history":   {"Point", "DevicePoint"},
	"devices":   {"NameSource", "Device"},
	"dataplane": {"AccessMode", "Model", "AppliedReason", "FieldReason", "FieldError"},
	"logs":      {"Level", "Source", "Entry"},
}

// A copy must match its domain type in the source, not only in the fields: the panel schema
// carries the godoc of the type and its fields and the values of its constants, and reflect
// sees none of them.
func TestCopiesMatchDomainTypes(t *testing.T) {
	own := declarations(t, ".")

	for pkg, names := range mirrored {
		domain := declarations(t, filepath.Join("..", pkg))

		for _, name := range names {
			for _, key := range []string{"type " + name, "const " + name} {
				want, inDomain := domain[key]
				got, inContract := own[key]

				switch {
				case !inDomain && !inContract:
				case !inDomain:
					t.Errorf("%s.%s: the copy has %q, the domain type does not", pkg, name, key)
				case !inContract:
					t.Errorf("%s.%s: %q is not copied into contract", pkg, name, key)
				case got != want:
					t.Errorf("%s.%s: %q differs from the domain source\ncontract:\n%s\ndomain:\n%s", pkg, name, key, got, want)
				}
			}
		}
	}
}

// declarations returns the source of the type declarations of a package and of the constant
// groups of its named types, with their doc comments: `type Name` and `const Name`.
func declarations(t *testing.T, dir string) map[string]string {
	t.Helper()

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	out := map[string]string{}

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}

		src, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}

		set := token.NewFileSet()

		file, err := parser.ParseFile(set, name, src, parser.ParseComments)
		if err != nil {
			t.Fatal(err)
		}

		for _, decl := range file.Decls {
			group, ok := decl.(*ast.GenDecl)
			if !ok || len(group.Specs) == 0 {
				continue
			}

			key := groupKey(group)
			if key == "" {
				continue
			}

			start := group.Pos()
			if group.Doc != nil {
				start = group.Doc.Pos()
			}

			out[key] = string(src[set.Position(start).Offset:set.Position(group.End()).Offset])
		}
	}

	return out
}

// groupKey names a single type declaration by its type and a constant group by the type of its
// first constant; anything else is empty.
func groupKey(group *ast.GenDecl) string {
	switch group.Tok {
	case token.TYPE:
		if group.Lparen.IsValid() {
			return ""
		}

		return "type " + group.Specs[0].(*ast.TypeSpec).Name.Name
	case token.CONST:
		value, ok := group.Specs[0].(*ast.ValueSpec)
		if !ok {
			return ""
		}

		if ident, ok := value.Type.(*ast.Ident); ok {
			return "const " + ident.Name
		}

		return ""
	default:
		return ""
	}
}
