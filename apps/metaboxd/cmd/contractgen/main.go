// Command contractgen печатает Zod-схемы контракта демона: он читает исходники
// пакетов, которые отдают тела наружу, и переводит их структуры в схемы для
// панели.
//
// Разбор идёт по исходникам, а не рефлексией: тела ответов `internal/httpapi`
// не экспортируются, и достать их из другого пакета нельзя. По исходникам
// заодно переносятся godoc-комментарии полей — панель показывает их в формах.
package main

import (
	"flag"
	"fmt"
	"os"
)

// roots — типы, которые демон отдаёт наружу. Их зависимости генератор находит
// сам; всё остальное во внутренних пакетах его не касается.
var roots = []rootType{
	{pkg: "internal/httpapi", name: "statusResponse"},
	{pkg: "internal/httpapi", name: "versionsResponse"},
	{pkg: "internal/httpapi", name: "serviceResponse"},
	{pkg: "internal/httpapi", name: "healthResponse"},
	{pkg: "internal/httpapi", name: "checkDetails"},
	{pkg: "internal/httpapi", name: "APIError"},
	{pkg: "internal/events", name: "Connection"},
	{pkg: "internal/events", name: "ConnectionsSnapshot"},
	{pkg: "internal/events", name: "Event"},
	{pkg: "internal/route", name: "Explanation"},
	{pkg: "internal/apply", name: "Transaction"},
	{pkg: "internal/config", name: "Version"},
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
