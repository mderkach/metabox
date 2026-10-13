package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

// rootType is a type the daemon returns outside: the package relative to the module root
// and the declaration name.
type rootType struct {
	pkg  string
	name string
}

// field is a struct field in the form the panel will see it.
type field struct {
	json     string
	optional bool
	doc      string
	typ      ast.Expr
}

// sources holds the declarations of all parsed packages: a field type may refer
// to a neighbouring package, and it has to be searched in all of them at once.
type sources struct {
	decls map[string]*ast.TypeSpec
	docs  map[string]string
	// values are the string constants of a named type in declaration order:
	// `contract.ErrorCode` → rejection codes. They go into the schema as a list, and the panel
	// types its tables with them.
	values map[string][]string
	root   string
	read   map[string]bool
}

func parseSources(root string, pkgs []string) (*sources, error) {
	out := &sources{
		decls:  map[string]*ast.TypeSpec{},
		docs:   map[string]string{},
		values: map[string][]string{},
		root:   root,
		read:   map[string]bool{},
	}

	for _, pkg := range pkgs {
		if err := out.readPackage(pkg); err != nil {
			return nil, err
		}
	}

	return out, nil
}

// readPackage parses a package if it has not been read yet. The contract refers to
// domain types, `apply.Transaction`, `config.Version`, and their packages
// are loaded on the way, not listed in a second list.
func (s *sources) readPackage(pkg string) error {
	if s.read[pkg] {
		return nil
	}

	s.read[pkg] = true
	set := token.NewFileSet()

	for _, pkg := range []string{pkg} {
		dir := filepath.Join(s.root, filepath.FromSlash(pkg))

		entries, err := os.ReadDir(dir)
		if err != nil {
			return fmt.Errorf("reading %s: %w", pkg, err)
		}

		for _, entry := range entries {
			if entry.IsDir() || !isSource(entry.Name()) {
				continue
			}

			file, err := parser.ParseFile(set, filepath.Join(dir, entry.Name()), nil, parser.ParseComments)
			if err != nil {
				return fmt.Errorf("parsing %s: %w", entry.Name(), err)
			}

			collectDecls(s, pkg, file)
		}
	}

	return nil
}

// isSource drops tests: the contract is declared in working files, and test
// structs with the same names would lead the generator astray.
func isSource(name string) bool {
	return strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
}

func collectDecls(out *sources, pkg string, file *ast.File) {
	for _, decl := range file.Decls {
		group, ok := decl.(*ast.GenDecl)
		if !ok {
			continue
		}

		if group.Tok == token.TYPE {
			collectTypes(out, pkg, group)
		}

		if group.Tok == token.CONST {
			collectValues(out, pkg, group)
		}
	}
}

func collectTypes(out *sources, pkg string, group *ast.GenDecl) {
	for _, spec := range group.Specs {
		typeSpec, ok := spec.(*ast.TypeSpec)
		if !ok {
			continue
		}

		key := pkg + "." + typeSpec.Name.Name
		out.decls[key] = typeSpec
		out.docs[key] = docText(group.Doc, typeSpec.Doc)
	}
}

// collectValues remembers the string constants of named types. The type must
// stand right at the entry: a constant without it is not a member of the enum but a plain
// string, and attributing it to a neighbour's type means inventing a value the
// neighbour does not have.
func collectValues(out *sources, pkg string, group *ast.GenDecl) {
	for _, spec := range group.Specs {
		value, ok := spec.(*ast.ValueSpec)
		if !ok {
			continue
		}

		named, ok := value.Type.(*ast.Ident)
		if !ok {
			continue
		}

		for _, expr := range value.Values {
			literal, ok := expr.(*ast.BasicLit)
			if !ok || literal.Kind != token.STRING {
				continue
			}

			key := pkg + "." + named.Name
			out.values[key] = append(out.values[key], strings.Trim(literal.Value, `"`))
		}
	}
}

func docText(groups ...*ast.CommentGroup) string {
	for _, group := range groups {
		if group == nil {
			continue
		}

		lines := make([]string, 0, len(group.List))

		for _, line := range group.List {
			text := strings.TrimSpace(strings.TrimPrefix(line.Text, "//"))
			if text != "" {
				lines = append(lines, text)
			}
		}

		if len(lines) > 0 {
			return strings.Join(lines, " ")
		}
	}

	return ""
}

// structOf expands a declaration to a struct. `false` means the type is not declared
// as a struct: such fields are printed by their base type.
func (s *sources) structOf(key string) (*ast.StructType, bool) {
	spec, ok := s.decls[key]
	if !ok {
		return nil, false
	}

	body, ok := spec.Type.(*ast.StructType)

	return body, ok
}

func (s *sources) fieldsOf(body *ast.StructType) []field {
	out := make([]field, 0, len(body.Fields.List))

	for _, item := range body.Fields.List {
		name, optional, ok := jsonName(item.Tag)
		if !ok {
			continue
		}

		out = append(out, field{
			json:     name,
			optional: optional || isPointer(item.Type),
			doc:      docText(item.Doc, item.Comment),
			typ:      item.Type,
		})
	}

	return out
}

// jsonName reads the field name from the tag. `false` means the field does not go outside: no tag
// or a hidden name.
func jsonName(tag *ast.BasicLit) (string, bool, bool) {
	if tag == nil {
		return "", false, false
	}

	value := strings.Trim(tag.Value, "`")
	marker := `json:"`

	start := strings.Index(value, marker)
	if start == -1 {
		return "", false, false
	}

	rest := value[start+len(marker):]
	end := strings.Index(rest, `"`)

	if end == -1 {
		return "", false, false
	}

	parts := strings.Split(rest[:end], ",")
	name := parts[0]

	if name == "" || name == "-" {
		return "", false, false
	}

	optional := false

	for _, option := range parts[1:] {
		if option == "omitempty" {
			optional = true
		}
	}

	return name, optional, true
}

func isPointer(expr ast.Expr) bool {
	_, ok := expr.(*ast.StarExpr)

	return ok
}
