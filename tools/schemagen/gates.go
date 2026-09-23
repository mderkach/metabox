package main

import (
	"fmt"
	"go/ast"
	"go/build/constraint"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Реестр определяется пакетом, чья функция регистрирует тип: у форка это
// пакеты adapter/* и dns.
var registryPackages = map[string]string{
	forkModule + "/adapter/inbound":     "inbound",
	forkModule + "/adapter/outbound":    "outbound",
	forkModule + "/adapter/endpoint":    "endpoint",
	forkModule + "/adapter/provider":    "provider",
	forkModule + "/adapter/service":     "service",
	forkModule + "/adapter/certificate": "certificate_provider",
	forkModule + "/dns":                 "dns",
}

const constantPackage = forkModule + "/constant"

// buildGates читает, какой build-тег нужен бинарю, чтобы запустить тип узла:
// реестр → тип → тег.
//
// Рефлексией этого не узнать: заглушка без тега регистрирует тот же тип с теми
// же опциями, что и настоящий файл, и отличается только ошибкой при запуске
// («QUIC is not included in this build»). Поэтому источник — исходники
// include/ форка: файл под `//go:build with_x` или `!with_x` регистрирует типы,
// которые без тега не работают. Регистрация бывает прямой —
// `inbound.Register[...](registry, C.TypeHysteria, ...)` — и через функцию
// пакета протокола, `warp.RegisterEndpoint(registry)`; вторая читается на
// один уровень вглубь.
//
// Платформенная часть условия (`linux || windows` у usbip) не учитывается:
// панель управляет роутером на Linux.
func buildGates(dir string) (map[string]map[string]string, error) {
	consts, err := constantValues(dir)
	if err != nil {
		return nil, err
	}

	files, err := filepath.Glob(filepath.Join(dir, "include", "*.go"))
	if err != nil {
		return nil, fmt.Errorf("список include: %w", err)
	}

	gates := map[string]map[string]string{}
	for _, path := range files {
		tag, err := fileGateTag(path)
		if err != nil {
			return nil, err
		}
		if tag == "" {
			continue
		}

		found, err := registeredTypes(dir, path, consts, "")
		if err != nil {
			return nil, err
		}

		for _, entry := range found {
			if gates[entry.registry] == nil {
				gates[entry.registry] = map[string]string{}
			}
			if prev, ok := gates[entry.registry][entry.key]; ok && prev != tag {
				return nil, fmt.Errorf("тип %s/%s закрыт двумя тегами: %s и %s", entry.registry, entry.key, prev, tag)
			}
			gates[entry.registry][entry.key] = tag
		}
	}

	if len(gates) == 0 {
		return nil, fmt.Errorf("в %s не нашлось типов под build-тегами: разбор include/ разошёлся с форком", dir)
	}

	return gates, nil
}

// fileGateTag отдаёт тег `with_*` из условия сборки файла. Пустая строка —
// файл собирается всегда.
func fileGateTag(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("чтение %s: %w", path, err)
	}

	for line := range strings.Lines(string(raw)) {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "package ") {
			break
		}
		if !constraint.IsGoBuild(line) {
			continue
		}

		expr, err := constraint.Parse(line)
		if err != nil {
			return "", fmt.Errorf("условие сборки %s: %w", path, err)
		}

		tags := map[string]bool{}
		collectGateTags(expr, tags)
		if len(tags) > 1 {
			return "", fmt.Errorf("%s закрыт несколькими тегами: %v", path, tags)
		}
		for tag := range tags {
			return tag, nil
		}
	}

	return "", nil
}

func collectGateTags(expr constraint.Expr, tags map[string]bool) {
	switch node := expr.(type) {
	case *constraint.TagExpr:
		if strings.HasPrefix(node.Tag, "with_") {
			tags[node.Tag] = true
		}
	case *constraint.NotExpr:
		collectGateTags(node.X, tags)
	case *constraint.AndExpr:
		collectGateTags(node.X, tags)
		collectGateTags(node.Y, tags)
	case *constraint.OrExpr:
		collectGateTags(node.X, tags)
		collectGateTags(node.Y, tags)
	}
}

type gatedType struct {
	registry string
	key      string
}

// registeredTypes находит в файле регистрации типов. Пустой only — файл
// include/: из него разрешён шаг в пакет протокола, чья функция принимает
// реестр. Непустой — файл такого пакета, и читается только названная функция:
// соседние в том же пакете могут регистрировать типы без всякого тега.
func registeredTypes(dir, path string, consts map[string]string, only string) ([]gatedType, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
	if err != nil {
		return nil, fmt.Errorf("разбор %s: %w", path, err)
	}

	imports := map[string]string{}
	for _, spec := range file.Imports {
		importPath, _ := strconv.Unquote(spec.Path.Value)
		name := importPath[strings.LastIndex(importPath, "/")+1:]
		if spec.Name != nil {
			name = spec.Name.Name
		}
		imports[name] = importPath
	}

	var root ast.Node = file
	if only != "" {
		root = nil
		for _, decl := range file.Decls {
			if fn, ok := decl.(*ast.FuncDecl); ok && fn.Recv == nil && fn.Name.Name == only {
				root = fn
			}
		}
		if root == nil {
			return nil, nil
		}
	}

	var found []gatedType
	var walkErr error
	ast.Inspect(root, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || walkErr != nil {
			return walkErr == nil
		}

		pkg, fn := calleeOf(call.Fun)
		importPath := imports[pkg]

		if registry, ok := registryPackages[importPath]; ok && strings.HasPrefix(fn, "Register") && len(call.Args) >= 2 {
			if key := constantOf(call.Args[1], imports, consts); key != "" {
				found = append(found, gatedType{registry: registry, key: key})
			}
			return true
		}

		if only == "" && strings.HasPrefix(fn, "Register") && strings.HasPrefix(importPath, forkModule+"/") && len(call.Args) == 1 {
			nested, err := packageTypes(dir, importPath, fn, consts)
			if err != nil {
				walkErr = err
				return false
			}
			found = append(found, nested...)
		}

		return true
	})

	return found, walkErr
}

func packageTypes(dir, importPath, fn string, consts map[string]string) ([]gatedType, error) {
	files, err := filepath.Glob(filepath.Join(dir, strings.TrimPrefix(importPath, forkModule+"/"), "*.go"))
	if err != nil {
		return nil, fmt.Errorf("список %s: %w", importPath, err)
	}

	var found []gatedType
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		nested, err := registeredTypes(dir, path, consts, fn)
		if err != nil {
			return nil, err
		}
		found = append(found, nested...)
	}

	return found, nil
}

// calleeOf разбирает `pkg.Fn`, `pkg.Fn[T]` и `pkg.Fn[T, U]`.
func calleeOf(fun ast.Expr) (pkg, fn string) {
	switch expr := fun.(type) {
	case *ast.IndexExpr:
		return calleeOf(expr.X)
	case *ast.IndexListExpr:
		return calleeOf(expr.X)
	case *ast.SelectorExpr:
		ident, ok := expr.X.(*ast.Ident)
		if !ok {
			return "", ""
		}
		return ident.Name, expr.Sel.Name
	}

	return "", ""
}

func constantOf(arg ast.Expr, imports map[string]string, consts map[string]string) string {
	selector, ok := arg.(*ast.SelectorExpr)
	if !ok {
		return ""
	}
	ident, ok := selector.X.(*ast.Ident)
	if !ok || imports[ident.Name] != constantPackage {
		return ""
	}

	return consts[selector.Sel.Name]
}

// emitGates печатает таблицу тегов. Типы, которых нет в схеме, в неё не
// попадают: формы для них нет, и помечать нечего.
func emitGates(b *strings.Builder, gates map[string]map[string]string, groups []registryGroup) {
	known := map[string]map[string]bool{}
	for _, group := range groups {
		known[group.name] = map[string]bool{}
		for _, entry := range group.entries {
			known[group.name][entry.key] = true
		}
	}

	b.WriteString(`/**
 * Build-тег, без которого бинарь форка не запустит тип узла: реестр → тип → тег.
 * Прочитано из include/ форка. С какими тегами собран бинарь на устройстве,
 * сообщает демон; тип без записи здесь есть в любой сборке.
 */
export const BUILD_TAG_OF_TYPE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
`)

	registries := make([]string, 0, len(gates))
	for registry := range gates {
		registries = append(registries, registry)
	}
	sort.Strings(registries)

	for _, registry := range registries {
		keys := make([]string, 0, len(gates[registry]))
		for key := range gates[registry] {
			if known[registry][key] {
				keys = append(keys, key)
			}
		}
		if len(keys) == 0 {
			continue
		}
		sort.Strings(keys)

		fmt.Fprintf(b, "  %s: {\n", strconv.Quote(registry))
		for _, key := range keys {
			fmt.Fprintf(b, "    %s: %s,\n", strconv.Quote(key), strconv.Quote(gates[registry][key]))
		}
		b.WriteString("  },\n")
	}

	b.WriteString("}\n\n")
}
