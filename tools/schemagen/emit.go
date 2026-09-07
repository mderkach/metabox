package main

import (
	"fmt"
	"strings"
)

const fileHeader = `// Сгенерировано tools/schemagen из sing-box-extended %s. Не редактировать:
// правится генератор, файл пересобирается ` + "`make schema`" + `.
//
// Схемы держатся представимыми для z.toJSONSchema(): по ним строится
// авторендерер непокрытых узлов конфига (docs/adr/ADR-0001).

import * as z from "zod"

`

// emit печатает файл со схемами. Ссылки внутри объектов идут геттерами и
// разрешаются при обращении к полю, поэтому взаимная рекурсия порядка не
// требует; всё остальное — массивы, union'ы, .extend() — вычисляется сразу
// при объявлении, и такие схемы schemaSet.sorted ставит после их зависимостей.
func emit(set *schemaSet, root *schema, version string) string {
	var b strings.Builder
	fmt.Fprintf(&b, fileHeader, version)

	for _, named := range set.sorted() {
		fmt.Fprintf(&b, "export const %s = ", named.name)
		named.schema.write(&b, "")
		b.WriteString("\n\n")
	}

	b.WriteString("export const ConfigSchema = ")
	root.write(&b, "")
	b.WriteString("\n\nexport type Config = z.infer<typeof ConfigSchema>\n")

	return b.String()
}
