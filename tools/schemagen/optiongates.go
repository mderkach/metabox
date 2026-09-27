package main

import (
	"fmt"
	"go/build/constraint"
	"go/parser"
	"go/token"
	"path/filepath"
	"sort"
	"strings"
)

// optionGate — опция конфига, которую закрывает build-тег, и файл-заглушка,
// по которому существование затвора сверяется при генерации.
type optionGate struct {
	// option — путь опции в конфиге; он же ключ таблицы BUILD_TAG_OF_OPTION.
	option string
	tag    string
	// module и stub указывают, где живёт заглушка `//go:build !<tag>`: не все
	// затворы лежат в самом форке — стек gvisor закрыт тегом внутри sing-tun.
	module string
	stub   string
}

// Таблица записана руками: затворы опций разбросаны по пакетам форка и его
// зависимостей, единого места вроде include/ у них нет. От расхождения с
// форком её держит buildOptionGates — уехавшая или сменившая условие заглушка
// валит генерацию, а не оставляет таблицу неполной молча.
var optionGates = []optionGate{
	{option: "experimental.clash_api", tag: "with_clash_api", module: forkModule, stub: "include/clashapi_stub.go"},
	{option: "experimental.v2ray_api", tag: "with_v2ray_api", module: forkModule, stub: "include/v2rayapi_stub.go"},
	{option: "tls.utls", tag: "with_utls", module: forkModule, stub: "common/tls/utls_stub.go"},
	{option: "tun.stack", tag: "with_gvisor", module: "github.com/sagernet/sing-tun", stub: "stack_gvisor_stub.go"},
}

// buildOptionGates сверяет каждую запись таблицы с заглушкой в исходниках и
// отдаёт таблицу для печати.
func buildOptionGates() ([]optionGate, error) {
	dirs := map[string]string{}

	for _, gate := range optionGates {
		if _, ok := dirs[gate.module]; !ok {
			dir, err := moduleDir(gate.module)
			if err != nil {
				return nil, err
			}
			dirs[gate.module] = dir
		}

		if err := checkStub(filepath.Join(dirs[gate.module], gate.stub), gate.tag); err != nil {
			return nil, fmt.Errorf("затвор опции %s: %w", gate.option, err)
		}
	}

	return optionGates, nil
}

// checkStub убеждается, что файл собирается ровно тогда, когда тега нет:
// такой файл и есть заглушка, отвечающая ошибкой вместо реализации.
func checkStub(path, tag string) error {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return fmt.Errorf("разбор заглушки: %w", err)
	}

	for _, group := range file.Comments {
		for _, comment := range group.List {
			if !constraint.IsGoBuild(comment.Text) {
				continue
			}

			expr, err := constraint.Parse(comment.Text)
			if err != nil {
				return fmt.Errorf("условие сборки %q: %w", comment.Text, err)
			}

			withTag := expr.Eval(func(name string) bool { return name == tag })
			withoutTags := expr.Eval(func(string) bool { return false })

			if withTag || !withoutTags {
				return fmt.Errorf("условие %q в %s больше не значит «сборка без %s»", comment.Text, path, tag)
			}

			return nil
		}
	}

	return fmt.Errorf("в %s нет условия сборки: файл перестал быть заглушкой тега %s", path, tag)
}

// emitOptionGates печатает таблицу тегов опций. Литерал с `as const`, а не
// Record: панель держит по детектору на каждый ключ, и новая запись здесь
// обязана ломать её компиляцию, а не проходить незамеченной.
func emitOptionGates(b *strings.Builder, gates []optionGate) {
	b.WriteString(`/**
 * Build-тег, без которого бинарь форка не запустит опцию конфига: путь → тег.
 * Существование затвора сверено с заглушками форка при генерации. С какими
 * тегами собран бинарь на устройстве, сообщает демон.
 */
export const BUILD_TAG_OF_OPTION = {
`)

	sorted := make([]optionGate, len(gates))
	copy(sorted, gates)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].option < sorted[j].option })

	for _, gate := range sorted {
		fmt.Fprintf(b, "  %q: %q,\n", gate.option, gate.tag)
	}

	b.WriteString("} as const\n\n")
}
