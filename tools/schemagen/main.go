// Command schemagen generates Zod schemas from the sing-box-extended option
// types: it imports the fork as a library and inspects it with reflection.
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

// forkVersion goes into the header of the generated file: it shows which
// schema the frontend is built on.
const forkVersion = "v1.14.1-extended-2.7.2"

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

	if err := checkUnmarkedReferences(); err != nil {
		return "", err
	}

	groups, err := collectRegistries()
	if err != nil {
		return "", err
	}

	// Descriptions are read from the sources of the same fork the schema is built from:
	// reflection does not see godoc. The directory is already known, forkDir returns it.
	dir, err := forkDir()
	if err != nil {
		return "", err
	}

	w := newWalker(readDocs(dir, docPackages))
	w.registryUnions(groups)

	root := w.build(reflect.TypeOf(option.Options{}), "root")

	if report := w.unknownReport(); report != nil {
		return "", fmt.Errorf("types with their own serialization lacking a rule in the override table (%d):\n%s",
			len(report), strings.Join(report, "\n"))
	}

	gates, err := buildGates(dir)
	if err != nil {
		return "", err
	}

	options, err := buildOptionGates()
	if err != nil {
		return "", err
	}

	return emit(w.set, root, forkVersion, gates, options, groups, tagReferences(w.set, root)), nil
}

// registryUnions builds the registry unions before walking the root: in the options tree they
// appear as types substituted from a registry, and they cannot be walked
// by reflection.
func (w *walker) registryUnions(groups []registryGroup) {
	shadows := map[string]reflect.Type{
		"inbound":              reflect.TypeOf(option.Inbound{}),
		"outbound":             reflect.TypeOf(option.Outbound{}),
		"endpoint":             reflect.TypeOf(option.Endpoint{}),
		"provider":             reflect.TypeOf(option.Provider{}),
		"service":              reflect.TypeOf(option.Service{}),
		"dns":                  reflect.TypeOf(option.DNSServerOptions{}),
		"certificate_provider": reflect.TypeOf(option.CertificateProvider{}),
	}
	names := map[string]string{
		"inbound":              "option.Inbound",
		"outbound":             "option.Outbound",
		"endpoint":             "option.Endpoint",
		"provider":             "option.Provider",
		"service":              "option.Service",
		"dns":                  "option.DNSServerOptions",
		"certificate_provider": "option.CertificateProvider",
	}

	// References are placed before the walk: bond and failover accept nested
	// inbounds and outbounds, that is, a union refers to itself.
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
