package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

// docPackages — пакеты форка, типы которых попадают в схему. Ключи описаний
// строятся по имени пакета, как их видит рефлексия.
var docPackages = []string{"option"}

// docSet держит godoc форка: ключ поля — `option.Тип.Поле`, ключ типа —
// `option.Тип`. Рефлексия комментариев не видит, поэтому они читаются из
// исходников того же модуля, из которого собрана схема.
type docSet struct {
	text map[string]string
}

// readDocs разбирает пакеты форка, из которых собирается схема. Пустой набор —
// не ошибка: схема соберётся без описаний, а генератор не должен падать там,
// где исходников рядом нет.
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

// field отдаёт описание поля структуры; пустая строка — описания нет.
func (d *docSet) field(goType, name string) string {
	return d.text[goType+"."+name]
}

// docText склеивает комментарий в одну строку: в схеме он печатается JSDoc, а
// перенос строки внутри `/** */` ломал бы отступы сгенерированного файла.
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
