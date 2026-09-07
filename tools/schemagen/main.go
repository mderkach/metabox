// Command schemagen generates Zod schemas from the sing-box-extended option
// types: it imports the fork as a library and inspects it with reflection.
// See docs/adr/ADR-0001 for the rationale and the algorithm.
//
// This is a separate Go module on purpose, so the fork's dependency tree is
// never linked into the daemon.
package main

import (
	"flag"
	"fmt"
	"os"
	"reflect"
	"strings"

	"github.com/sagernet/sing-box/option"
)

// forkVersion попадает в шапку сгенерированного файла: по нему видно, на
// какой схеме собран фронт (AC-28).
const forkVersion = "v1.13.18-extended-2.6.5"

func main() {
	out := flag.String("out", "", "path of the generated schema file")
	flag.Parse()

	if *out == "" {
		fmt.Fprintln(os.Stderr, "schemagen: -out is required")
		os.Exit(2)
	}

	content, err := generate()
	if err != nil {
		fmt.Fprintln(os.Stderr, "schemagen:", err)
		os.Exit(1)
	}

	if err := os.WriteFile(*out, []byte(content), 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "schemagen:", err)
		os.Exit(1)
	}
}

func generate() (string, error) {
	if err := checkBuildTags(); err != nil {
		return "", err
	}

	groups, err := collectRegistries()
	if err != nil {
		return "", err
	}

	w := newWalker()
	w.registryUnions(groups)

	root := w.build(reflect.TypeOf(option.Options{}), "root")

	if report := w.unknownReport(); report != nil {
		return "", fmt.Errorf("типы со своей сериализацией без правила в таблице переопределений (%d):\n%s",
			len(report), strings.Join(report, "\n"))
	}

	return emit(w.set, root, forkVersion), nil
}

// registryUnions строит union'ы реестров до обхода корня: в дереве опций они
// встречаются как типы с подстановкой из реестра, и обойти их рефлексией
// нельзя.
func (w *walker) registryUnions(groups []registryGroup) {
	shadows := map[string]reflect.Type{
		"inbound":  reflect.TypeOf(option.Inbound{}),
		"outbound": reflect.TypeOf(option.Outbound{}),
		"endpoint": reflect.TypeOf(option.Endpoint{}),
		"provider": reflect.TypeOf(option.Provider{}),
		"service":  reflect.TypeOf(option.Service{}),
		"dns":      reflect.TypeOf(option.DNSServerOptions{}),
	}
	names := map[string]string{
		"inbound":  "option.Inbound",
		"outbound": "option.Outbound",
		"endpoint": "option.Endpoint",
		"provider": "option.Provider",
		"service":  "option.Service",
		"dns":      "option.DNSServerOptions",
	}

	// Ссылки расставляются до обхода: bond и failover принимают вложенные
	// inbound'ы и outbound'ы, то есть union ссылается сам на себя.
	for _, group := range groups {
		if goType, ok := names[group.name]; ok {
			w.byGoType[goType] = ref(camel(group.name) + "Schema")
		}
	}

	for _, group := range groups {
		shadow, ok := shadows[group.name]
		if !ok {
			continue
		}
		w.set.put(camel(group.name)+"Schema", w.registryUnion(group, shadow))
	}
}
