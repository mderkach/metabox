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

// rootType — тип, который демон отдаёт наружу: пакет относительно корня модуля
// и имя объявления.
type rootType struct {
	pkg  string
	name string
}

// field — поле структуры в том виде, в каком его увидит панель.
type field struct {
	json     string
	optional bool
	doc      string
	typ      ast.Expr
}

// sources держит объявления всех разобранных пакетов: тип поля может ссылаться
// на соседний пакет, и искать его приходится по всем сразу.
type sources struct {
	decls map[string]*ast.TypeSpec
	docs  map[string]string
	root  string
	read  map[string]bool
}

func parseSources(root string, pkgs []string) (*sources, error) {
	out := &sources{
		decls: map[string]*ast.TypeSpec{},
		docs:  map[string]string{},
		root:  root,
		read:  map[string]bool{},
	}

	for _, pkg := range pkgs {
		if err := out.readPackage(pkg); err != nil {
			return nil, err
		}
	}

	return out, nil
}

// readPackage разбирает пакет, если он ещё не прочитан. Контракт ссылается на
// доменные типы — `apply.Transaction`, `config.Version`, — и их пакеты
// подгружаются по ходу, а не перечисляются вторым списком.
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
			return fmt.Errorf("чтение %s: %w", pkg, err)
		}

		for _, entry := range entries {
			if entry.IsDir() || !isSource(entry.Name()) {
				continue
			}

			file, err := parser.ParseFile(set, filepath.Join(dir, entry.Name()), nil, parser.ParseComments)
			if err != nil {
				return fmt.Errorf("разбор %s: %w", entry.Name(), err)
			}

			collectDecls(s, pkg, file)
		}
	}

	return nil
}

// isSource отбрасывает тесты: контракт объявлен в рабочих файлах, а тестовые
// структуры с теми же именами увели бы генератор не туда.
func isSource(name string) bool {
	return strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
}

func collectDecls(out *sources, pkg string, file *ast.File) {
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
			out.decls[key] = typeSpec
			out.docs[key] = docText(group.Doc, typeSpec.Doc)
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

// structOf раскрывает объявление до структуры. `false` — тип объявлен не
// структурой: такие поля печатаются по своему базовому типу.
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

// jsonName читает имя поля из тега. `false` — поле наружу не уходит: без тега
// или со скрытым именем.
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
