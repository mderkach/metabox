// Command schemagen generates Zod schemas from the sing-box-extended option
// types: it imports the fork as a library and inspects it with reflection.
// See docs/PRD.md, section A.2.1 for the rationale and the algorithm.
//
// This is a separate Go module on purpose, so the fork's dependency tree is
// never linked into the daemon.
package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	out := flag.String("out", "", "path of the generated schema file")
	flag.Parse()

	if *out == "" {
		fmt.Fprintln(os.Stderr, "schemagen: -out is required")
		os.Exit(2)
	}

	fmt.Fprintln(os.Stderr, "schemagen: not implemented yet")
	os.Exit(1)
}
