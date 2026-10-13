// Command contractgen prints the Zod schemas of the daemon contract: it reads the sources
// of the packages that return bodies outside and translates their structs into schemas for
// the panel.
//
// Parsing works on sources, not by reflection: this way the godoc comments of the fields
// get into the schema, and the panel shows them in forms.
package main

import (
	"flag"
	"fmt"
	"os"
)

// roots are what the daemon returns outside. Response shapes are declared in
// `internal/contract`, the shapes of the stream and the route explanation in their own packages;
// the generator finds the dependencies itself. Private handler structs are not
// considered a contract and do not get here.
var roots = []rootType{
	{pkg: "internal/contract", name: "Health"},
	{pkg: "internal/contract", name: "Status"},
	{pkg: "internal/contract", name: "Versions"},
	{pkg: "internal/contract", name: "Service"},
	{pkg: "internal/contract", name: "History"},
	{pkg: "internal/contract", name: "Error"},
	{pkg: "internal/contract", name: "CheckDetails"},
	{pkg: "internal/contract", name: "WorkdirDetails"},
	{pkg: "internal/contract", name: "RuleSetFiles"},
	{pkg: "internal/contract", name: "ApplyEnvelope"},
	{pkg: "internal/contract", name: "Devices"},
	{pkg: "internal/contract", name: "DeviceName"},
	{pkg: "internal/contract", name: "Dataplane"},
	{pkg: "internal/contract", name: "DataplaneChange"},
	{pkg: "internal/contract", name: "DataplaneDetails"},
	{pkg: "internal/contract", name: "Logs"},
	{pkg: "internal/contract", name: "LogEvent"},
	{pkg: "internal/contract", name: "LogsCleared"},
	{pkg: "internal/device", name: "Stat"},
	{pkg: "internal/diag", name: "Report"},
	{pkg: "internal/events", name: "Connection"},
	{pkg: "internal/events", name: "ConnectionsSnapshot"},
	{pkg: "internal/events", name: "Event"},
	{pkg: "internal/route", name: "Explanation"},
	{pkg: "internal/route", name: "Hits"},
	{pkg: "internal/ruleset", name: "Catalog"},
}

func main() {
	out := flag.String("out", "", "path of the generated schema file")
	root := flag.String("root", ".", "module root to read sources from")
	flag.Parse()

	if *out == "" {
		fmt.Fprintln(os.Stderr, "contractgen: -out is required")
		os.Exit(2)
	}

	content, err := generate(*root, roots)
	if err != nil {
		fmt.Fprintln(os.Stderr, "contractgen:", err)
		os.Exit(1)
	}

	if err := os.WriteFile(*out, []byte(content), 0o600); err != nil {
		fmt.Fprintln(os.Stderr, "contractgen:", err)
		os.Exit(1)
	}
}
