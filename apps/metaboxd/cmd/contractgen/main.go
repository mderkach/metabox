// Command contractgen печатает Zod-схемы контракта демона: он читает исходники
// пакетов, которые отдают тела наружу, и переводит их структуры в схемы для
// панели.
//
// Разбор идёт по исходникам, а не рефлексией: так в схему попадают
// godoc-комментарии полей — панель показывает их в формах.
package main

import (
	"flag"
	"fmt"
	"os"
)

// roots — то, что демон отдаёт наружу. Формы ответов объявлены в
// `internal/contract`, формы потока и объяснение маршрута — в своих пакетах;
// зависимости генератор находит сам. Приватные структуры хендлеров контрактом
// не считаются и сюда не попадают.
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
	{pkg: "internal/device", name: "Stat"},
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
