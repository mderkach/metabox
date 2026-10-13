package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

// docPackages are the fork packages whose types get into the schema. Description keys
// are built from the package name as reflection sees it.
var docPackages = []string{"option"}

// docSet holds the godoc of the fork: a field key is `option.Type.Field`, a type key is
// `option.Type`. Reflection does not see comments, so they are read from
// the sources of the same module the schema is built from.
type docSet struct {
	text map[string]string
}

// readDocs parses the fork packages the schema is built from. An empty set is
// not an error: the schema is built without descriptions, and the generator must not fail where
// there are no sources nearby.
func readDocs(root string, pkgs []string) *docSet {
	out := &docSet{text: map[string]string{}}

	if root == "" {
		return out
	}

	set := token.NewFileSet()

	for _, pkg := range pkgs {
		dir := filepath.Join(root, pkg)

		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			name := entry.Name()
			if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
				continue
			}

			file, err := parser.ParseFile(set, filepath.Join(dir, name), nil, parser.ParseComments)
			if err != nil {
				continue
			}

			out.collect(pkg, file)
		}
	}

	return out
}

func (d *docSet) collect(pkg string, file *ast.File) {
	for _, decl := range file.Decls {
		group, ok := decl.(*ast.GenDecl)
		if !ok || group.Tok != token.TYPE {
			continue
		}

		for _, spec := range group.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}

			key := pkg + "." + typeSpec.Name.Name
			d.put(key, docText(group.Doc, typeSpec.Doc))

			body, ok := typeSpec.Type.(*ast.StructType)
			if !ok {
				continue
			}

			for _, item := range body.Fields.List {
				text := docText(item.Doc, item.Comment)
				if text == "" {
					continue
				}

				for _, ident := range item.Names {
					d.put(key+"."+ident.Name, text)
				}
			}
		}
	}
}

func (d *docSet) put(key, text string) {
	if text != "" {
		d.text[key] = text
	}
}

// field returns the description of a struct field; an empty string means no description.
func (d *docSet) field(goType, name string) string {
	return d.text[goType+"."+name]
}

// docText glues a comment into one line: in the schema it is printed as JSDoc, and
// a line break inside `/** */` would break the indentation of the generated file.
func docText(groups ...*ast.CommentGroup) string {
	for _, group := range groups {
		if group == nil {
			continue
		}

		lines := make([]string, 0, len(group.List))

		for _, line := range group.List {
			text := strings.TrimSpace(strings.TrimPrefix(line.Text, "//"))
			if text != "" && !strings.HasPrefix(text, "go:") {
				lines = append(lines, text)
			}
		}

		if len(lines) > 0 {
			return strings.Join(lines, " ")
		}
	}

	return ""
}
