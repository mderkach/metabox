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

// optionGate is a config option gated by a build tag and the stub file
// the gate existence is checked against during generation.
type optionGate struct {
	// option is the option path in the config; it is also the key of the BUILD_TAG_OF_OPTION table.
	option string
	tag    string
	// module and stub point to where the stub `//go:build !<tag>` lives: not all
	// gates lie in the fork itself, the gvisor stack is gated by a tag inside sing-tun.
	module string
	stub   string
}

// The table is written by hand: option gates are scattered across the fork packages and its
// dependencies, and there is no single place like include/ for them. It is kept from diverging from
// the fork by buildOptionGates: a stub that moved or changed its condition
// fails generation and does not leave the table silently incomplete.
var optionGates = []optionGate{
	{option: "experimental.clash_api", tag: "with_clash_api", module: forkModule, stub: "include/clashapi_stub.go"},
	{option: "experimental.v2ray_api", tag: "with_v2ray_api", module: forkModule, stub: "include/v2rayapi_stub.go"},
	{option: "tls.utls", tag: "with_utls", module: forkModule, stub: "common/tls/utls_stub.go"},
	{option: "tun.stack", tag: "with_gvisor", module: "github.com/sagernet/sing-tun", stub: "stack_gvisor_stub.go"},
}

// buildOptionGates checks each table entry against the stub in the sources and
// returns the table for printing.
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
			return nil, fmt.Errorf("option gate %s: %w", gate.option, err)
		}
	}

	return optionGates, nil
}

// checkStub makes sure the file is built exactly when the tag is absent:
// such a file is the stub, answering with an error instead of an implementation.
func checkStub(path, tag string) error {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return fmt.Errorf("parsing the stub: %w", err)
	}

	for _, group := range file.Comments {
		for _, comment := range group.List {
			if !constraint.IsGoBuild(comment.Text) {
				continue
			}

			expr, err := constraint.Parse(comment.Text)
			if err != nil {
				return fmt.Errorf("build condition %q: %w", comment.Text, err)
			}

			withTag := expr.Eval(func(name string) bool { return name == tag })
			withoutTags := expr.Eval(func(string) bool { return false })

			if withTag || !withoutTags {
				return fmt.Errorf("condition %q in %s no longer means \"build without %s\"", comment.Text, path, tag)
			}

			return nil
		}
	}

	return fmt.Errorf("no build condition in %s: the file is no longer a stub of tag %s", path, tag)
}

// emitOptionGates prints the option tag table. A literal with `as const`, not
// a Record: the panel keeps a detector for each key, and a new entry here
// must break its compilation, not pass unnoticed.
func emitOptionGates(b *strings.Builder, gates []optionGate) {
	b.WriteString(`/**
 * The build tag without which the fork binary will not run a config option: path → tag.
 * The gate existence is checked against the fork stubs at generation. Which
 * tags the binary on the device was built with is reported by the daemon.
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
