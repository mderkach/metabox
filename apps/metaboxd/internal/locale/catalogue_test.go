package locale

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// moduleRoot is the daemon module root seen from this package directory.
const moduleRoot = "../.."

// skipDirs hold no text the shipped daemon shows: fixtures, the embedded panel
// build and the development commands under cmd.
var skipDirs = []string{"testdata", "static", "cmd"}

// textArg is the position of the text argument in the calls that take one.
var textArg = map[string]int{"T": 1, "Sprintf": 1, "Errorf": 0, "New": 0}

// flagUsage is the position of the usage text, the text -h shows, in the flag
// package calls that define a flag.
var flagUsage = map[string]int{
	"Bool": 2, "BoolVar": 3, "BoolFunc": 1, "Duration": 2, "DurationVar": 3,
	"Float64": 2, "Float64Var": 3, "Func": 1, "Int": 2, "IntVar": 3,
	"Int64": 2, "Int64Var": 3, "String": 2, "StringVar": 3, "TextVar": 3,
	"Uint": 2, "UintVar": 3, "Uint64": 2, "Uint64Var": 3, "Var": 2,
}

type use struct {
	text string
	pos  token.Position
}

// TestCatalogueMatchesSources checks the catalogue against the texts the
// daemon sources show: every text has a Russian entry, every entry is shown
// somewhere, and an entry formats the same arguments as its source.
func TestCatalogueMatchesSources(t *testing.T) {
	uses := sourceTexts(t)

	used := map[string]bool{}

	for _, u := range uses {
		used[u.text] = true

		if _, ok := ru[u.text]; !ok {
			t.Errorf("%s: no Russian text for %q", u.pos, u.text)
		}
	}

	for source, translated := range ru {
		if !used[source] {
			t.Errorf("Russian text for %q is not shown anywhere", source)
		}

		if strings.TrimSpace(translated) == "" {
			t.Errorf("Russian text for %q is empty", source)
		}

		if got, want := verbs(translated), verbs(source); !slices.Equal(got, want) {
			t.Errorf("Russian text for %q formats %v, the source formats %v", source, got, want)
		}
	}
}

func TestCatalogueHasCLIHelp(t *testing.T) {
	if got, want := T(Russian, "sing-box config directory"), "каталог конфига sing-box"; got != want {
		t.Errorf("Russian: got %q, want %q", got, want)
	}

	if got, want := T(English, "sing-box config directory"), "sing-box config directory"; got != want {
		t.Errorf("English: got %q, want %q", got, want)
	}
}

func sourceTexts(t *testing.T) []use {
	t.Helper()

	var uses []use

	fset := token.NewFileSet()

	err := filepath.WalkDir(moduleRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			if slices.Contains(skipDirs, d.Name()) {
				return filepath.SkipDir
			}

			return nil
		}

		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		file, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return err
		}

		uses = append(uses, fileTexts(t, fset, file)...)

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(uses) == 0 {
		t.Fatal("no texts found: the walk does not reach the sources")
	}

	return uses
}

func fileTexts(t *testing.T, fset *token.FileSet, file *ast.File) []use {
	t.Helper()

	self := file.Name.Name == "locale"
	localeName := importName(file, "metabox/internal/locale", "locale")
	flagName := importName(file, "flag", "flag")

	var uses []use

	add := func(call *ast.CallExpr, i int, strict bool) {
		if i >= len(call.Args) {
			return
		}

		text, ok := literal(call.Args[i])
		if !ok {
			// Inside the package the text arrives as a variable: that is the mechanism itself.
			if strict {
				t.Errorf("%s: the text is not a string literal, the catalogue test cannot check it", fset.Position(call.Pos()))
			}

			return
		}

		uses = append(uses, use{text: text, pos: fset.Position(call.Pos())})
	}

	ast.Inspect(file, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}

		switch fn := call.Fun.(type) {
		case *ast.Ident:
			if i, ok := textArg[fn.Name]; ok && self {
				add(call, i, false)
			}
		case *ast.SelectorExpr:
			pkg, ok := fn.X.(*ast.Ident)
			if !ok {
				return true
			}

			if i, ok := textArg[fn.Sel.Name]; ok && localeName != "" && pkg.Name == localeName {
				add(call, i, true)
			}

			if i, ok := flagUsage[fn.Sel.Name]; ok && flagName != "" && pkg.Name == flagName {
				add(call, i, true)
			}
		}

		return true
	})

	return uses
}

// importName is the name the file uses for the package at path, empty when the
// file does not import it.
func importName(file *ast.File, path, name string) string {
	for _, spec := range file.Imports {
		if p, _ := strconv.Unquote(spec.Path.Value); p == path {
			if spec.Name != nil {
				return spec.Name.Name
			}

			return name
		}
	}

	return ""
}

// literal evaluates a string literal or a concatenation of them.
func literal(expr ast.Expr) (string, bool) {
	switch e := expr.(type) {
	case *ast.BasicLit:
		if e.Kind != token.STRING {
			return "", false
		}

		s, err := strconv.Unquote(e.Value)

		return s, err == nil
	case *ast.BinaryExpr:
		if e.Op != token.ADD {
			return "", false
		}

		left, ok := literal(e.X)
		if !ok {
			return "", false
		}

		right, ok := literal(e.Y)

		return left + right, ok
	case *ast.ParenExpr:
		return literal(e.X)
	default:
		return "", false
	}
}

var verbPattern = regexp.MustCompile(`%(?:\[\d+\])?[-+# 0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?([a-zA-Z%])`)

// verbs lists the formatting verbs of s in sorted order, without %%: a
// translation may move them, but not change their set.
func verbs(s string) []string {
	var found []string

	for _, m := range verbPattern.FindAllStringSubmatch(s, -1) {
		if m[1] != "%" {
			found = append(found, m[1])
		}
	}

	slices.Sort(found)

	return found
}
