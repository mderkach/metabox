package main

import (
	"fmt"
	"go/ast"
	"sort"
	"strings"
	"unicode"
)

const header = `// Сгенерировано apps/metaboxd/cmd/contractgen из контракта демона. Не
// редактировать: правится демон, файл пересобирается ` + "`make schema-daemon`" + `.
//
// Схемы описывают форму ответа, но не переводят её: перевод и отказ живут в
// адаптерах слайсов (docs/adr/ADR-0005).

import { z } from 'zod'
`

// walker переводит объявления Go в схемы zod и помнит порядок: схема ссылается
// на соседнюю, и та обязана быть объявлена раньше.
type walker struct {
	src     *sources
	pkg     string
	printed map[string]bool
	order   []string
	bodies  map[string]string
}

func generate(root string, roots []rootType) (string, error) {
	pkgs := make([]string, 0, len(roots))
	seen := map[string]bool{}

	for _, item := range roots {
		if !seen[item.pkg] {
			seen[item.pkg] = true
			pkgs = append(pkgs, item.pkg)
		}
	}

	src, err := parseSources(root, pkgs)
	if err != nil {
		return "", err
	}

	w := &walker{src: src, printed: map[string]bool{}, bodies: map[string]string{}}

	for _, item := range roots {
		if err := w.schema(item.pkg, item.name); err != nil {
			return "", err
		}
	}

	return w.render(), nil
}

// schema печатает схему типа и всё, на что он ссылается.
func (w *walker) schema(pkg, name string) error {
	key := pkg + "." + name
	if w.printed[key] {
		return nil
	}

	body, ok := w.src.structOf(key)
	if !ok {
		return fmt.Errorf("тип %s не объявлен структурой", key)
	}

	w.printed[key] = true
	previous := w.pkg
	w.pkg = pkg

	fields := w.src.fieldsOf(body)
	lines := make([]string, 0, len(fields))

	for _, item := range fields {
		expr, err := w.expr(item.typ)
		if err != nil {
			return fmt.Errorf("%s.%s: %w", key, item.json, err)
		}

		if item.optional {
			expr += ".optional()"
		}

		if item.doc != "" {
			lines = append(lines, "  /** "+item.doc+" */")
		}

		lines = append(lines, fmt.Sprintf("  %s: %s,", quoteKey(item.json), expr))
	}

	w.pkg = previous

	declared := schemaName(name)
	text := ""

	if doc := w.src.docs[key]; doc != "" {
		text += "/** " + doc + " */\n"
	}

	text += fmt.Sprintf("export const %s = z.object({\n%s\n})\n", declared, strings.Join(lines, "\n"))

	w.bodies[declared] = text
	w.order = append(w.order, declared)

	return nil
}

// expr переводит тип поля в выражение zod.
func (w *walker) expr(node ast.Expr) (string, error) {
	switch typed := node.(type) {
	case *ast.StarExpr:
		return w.expr(typed.X)
	case *ast.ArrayType:
		inner, err := w.expr(typed.Elt)
		if err != nil {
			return "", err
		}

		// []byte приезжает строкой base64, а не списком чисел.
		if inner == "z.int()" && isByte(typed.Elt) {
			return "z.string()", nil
		}

		return "z.array(" + inner + ")", nil
	case *ast.MapType:
		value, err := w.expr(typed.Value)
		if err != nil {
			return "", err
		}

		return "z.record(z.string(), " + value + ")", nil
	case *ast.SelectorExpr:
		return w.qualified(typed)
	case *ast.InterfaceType:
		return "z.unknown()", nil
	case *ast.Ident:
		return w.named(typed.Name)
	}

	return "", fmt.Errorf("неизвестный тип поля")
}

// named разводит встроенные типы и объявления самого демона.
func (w *walker) named(name string) (string, error) {
	if builtin, ok := builtins[name]; ok {
		return builtin, nil
	}

	key := w.pkg + "." + name

	if _, ok := w.src.structOf(key); ok {
		if err := w.schema(w.pkg, name); err != nil {
			return "", err
		}

		return schemaName(name), nil
	}

	// Тип объявлен не структурой — печатается по базовому типу: `Phase string`
	// на проводе остаётся строкой.
	spec, ok := w.src.decls[key]
	if !ok {
		return "", fmt.Errorf("тип %s не найден", key)
	}

	return w.expr(spec.Type)
}

// qualified разбирает типы из других пакетов: свои раскрываются, чужие
// печатаются по правилу из таблицы.
func (w *walker) qualified(node *ast.SelectorExpr) (string, error) {
	pkg, ok := node.X.(*ast.Ident)
	if !ok {
		return "", fmt.Errorf("неизвестный тип поля")
	}

	qualified := pkg.Name + "." + node.Sel.Name

	if external, ok := externals[qualified]; ok {
		return external, nil
	}

	for key := range w.src.decls {
		if strings.HasSuffix(key, "/"+pkg.Name+"."+node.Sel.Name) {
			owner := strings.TrimSuffix(key, "."+node.Sel.Name)

			if _, ok := w.src.structOf(key); ok {
				if err := w.schema(owner, node.Sel.Name); err != nil {
					return "", err
				}

				return schemaName(node.Sel.Name), nil
			}
		}
	}

	return "", fmt.Errorf("тип %s не описан: добавьте правило в таблицу", qualified)
}

func (w *walker) render() string {
	declared := make([]string, len(w.order))
	copy(declared, w.order)

	parts := make([]string, 0, len(declared)+1)
	parts = append(parts, header)

	for _, name := range declared {
		parts = append(parts, w.bodies[name])
	}

	types := make([]string, 0, len(declared))

	for _, name := range declared {
		base := strings.TrimSuffix(name, "Schema")
		types = append(types, fmt.Sprintf("export type %sWire = z.infer<typeof %s>", base, name))
	}

	sort.Strings(types)
	parts = append(parts, strings.Join(types, "\n")+"\n")

	return strings.Join(parts, "\n")
}

func isByte(node ast.Expr) bool {
	ident, ok := node.(*ast.Ident)

	return ok && (ident.Name == "byte" || ident.Name == "uint8")
}

func quoteKey(name string) string {
	for _, symbol := range name {
		if !unicode.IsLetter(symbol) && !unicode.IsDigit(symbol) && symbol != '_' {
			return "'" + name + "'"
		}
	}

	return name
}

func schemaName(name string) string {
	runes := []rune(name)
	runes[0] = unicode.ToUpper(runes[0])

	return string(runes) + "Schema"
}
