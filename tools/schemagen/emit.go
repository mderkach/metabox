package main

import (
	"fmt"
	"strings"
)

const fileHeader = `// Сгенерировано tools/schemagen из sing-box-extended %s. Не редактировать:
// правится генератор, файл пересобирается ` + "`make schema`" + `.
//
// Схемы держатся представимыми для z.toJSONSchema(): по ним строится
// авторендерер непокрытых узлов конфига.

import * as z from "zod"

/**
 * Версия форка, из которой собраны эти схемы. Панель сверяет её с версией
 * бинаря на устройстве: формы знают ровно те типы, что были в этой версии.
 */
export const SCHEMA_FORK_VERSION = "%[1]s"

`

// emit печатает файл со схемами. Ссылки внутри объектов идут геттерами и
// разрешаются при обращении к полю, поэтому взаимная рекурсия порядка не
// требует; всё остальное — массивы, union'ы, .extend() — вычисляется сразу
// при объявлении, и такие схемы schemaSet.sorted ставит после их зависимостей.
func emit(set *schemaSet, root *schema, version string, gates map[string]map[string]string, groups []registryGroup) string {
	var b strings.Builder
	fmt.Fprintf(&b, fileHeader, version)
	emitGates(&b, gates, groups)

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
