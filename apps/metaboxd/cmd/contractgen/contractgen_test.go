package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// moduleRoot — корень модуля от каталога теста.
const moduleRoot = "../.."

// TestGenerateSample держит перевод типов: механический snake→camel ломается на
// уже-camel теге и на аббревиатуре, а необязательность приходит и из
// omitempty, и из указателя.
func TestGenerateSample(t *testing.T) {
	out, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Sample"}})
	if err != nil {
		t.Fatalf("генерация: %v", err)
	}

	tests := []struct {
		name string
		want string
	}{
		{"snake остаётся как в теге", "snake_field: z.string(),"},
		{"уже-camel тег не трогается", "lastError: z.string().optional(),"},
		{"аббревиатура сохраняется", "sourceIP: z.string(),"},
		{"указатель необязателен", "pointer: NestedSchema.optional(),"},
		{"структура по значению обязательна", "required: NestedSchema,"},
		{"список", "list: z.array(z.string()),"},
		{"словарь", "dictionary: z.record(z.string(), NestedSchema),"},
		{"длительность — число наносекунд", "window: z.int(),"},
		{"время — строка", "moment: z.string(),"},
		{"сырое сообщение", "raw: z.unknown(),"},
		{"тип поверх строки", "phase: z.string(),"},
		{"целое", "count: z.int(),"},
		{"дробное", "ratio: z.number(),"},
		{"флаг", "flag: z.boolean(),"},
		{"вложенная схема объявлена раньше владельца", "export const NestedSchema"},
		{"godoc поля уходит в JSDoc", "/** Value — поле с комментарием: он уходит в JSDoc. */"},
		{"тип выводится из схемы", "export type SampleWire = z.infer<typeof SampleSchema>"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !strings.Contains(out, tt.want) {
				t.Errorf("в схеме нет %q", tt.want)
			}
		})
	}

	for _, unwanted := range []string{"Hidden", "Untagged"} {
		if strings.Contains(out, unwanted) {
			t.Errorf("поле %q не уходит наружу, но попало в схему", unwanted)
		}
	}

	if strings.Index(out, "export const NestedSchema") > strings.Index(out, "export const SampleSchema") {
		t.Error("схема объявлена позже, чем на неё ссылаются")
	}
}

// TestGenerateIsStable: два прогона на одном дереве дают один файл, иначе
// `make schema-daemon` шумит в diff без правок демона.
func TestGenerateIsStable(t *testing.T) {
	first, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Sample"}})
	if err != nil {
		t.Fatalf("первый прогон: %v", err)
	}

	second, err := generate("testdata", []rootType{{pkg: "internal/sample", name: "Sample"}})
	if err != nil {
		t.Fatalf("второй прогон: %v", err)
	}

	if first != second {
		t.Error("два прогона дали разный файл")
	}
}

// TestGenerateContract: контракт самого демона снимается целиком и содержит
// формы, на которых стоит панель.
func TestGenerateContract(t *testing.T) {
	out, err := generate(moduleRoot, roots)
	if err != nil {
		t.Fatalf("генерация контракта: %v", err)
	}

	for _, want := range []string{
		"export const StatusResponseSchema",
		"export const ConnectionsSnapshotSchema",
		"export const ExplanationSchema",
		"export const TransactionSchema",
		"export const VersionsResponseSchema",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("в контракте нет %q", want)
		}
	}
}

// TestGeneratedFileIsFresh ловит артефакт, собранный на прежнем контракте:
// pre-commit проверяет это же, но локально он выключаем.
func TestGeneratedFileIsFresh(t *testing.T) {
	path := filepath.Join(moduleRoot, "..", "web", "src", "shared", "api", "daemon.generated.ts")

	stored, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("артефакта нет: %v", err)
	}

	fresh, err := generate(moduleRoot, roots)
	if err != nil {
		t.Fatalf("генерация: %v", err)
	}

	if string(stored) != fresh {
		t.Error("apps/web/src/shared/api/daemon.generated.ts собран не из текущего контракта: `make schema-daemon`")
	}
}
