package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Схема должна собираться целиком: любой тип со своей сериализацией без
// правила обрывает генерацию, поэтому успешный прогон и есть проверка
// полноты таблицы переопределений.
func TestGenerate(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		"export const ConfigSchema",
		"export const InboundSchema",
		"export const OutboundSchema",
		"export const DnsSchema",
		"export type Config",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("в схеме нет %q", want)
		}
	}

	// Трансформ превращает ZodObject в ZodPipe: пропадают .extend, .omit и
	// .pick, на которых собрана схема правил, а z.toJSONSchema перестаёт
	// печатать выходную сторону — авторендерер получит пустой узел вместо поля
	//.
	if strings.Contains(out, ".transform(") {
		t.Error("в генерируемой схеме есть .transform(): ломаются .extend и z.toJSONSchema")
	}
}

// Описания полей форка доходят до схемы: подсказки видит и разработчик, и
// авторендерер непокрытых узлов (Form&Validation).
func TestGenerateCarriesDocs(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatalf("генерация: %v", err)
	}

	if !strings.Contains(out, "/** Deprecated:") {
		t.Error("в схеме нет ни одного описания поля: godoc форка не прочитан")
	}
}

// Встроенные структуры уплощаются и внутри union'а по дискриминатору. У
// клиента HTTP настройки набора соединения и TLS приходят встраиванием, и без
// них строгая схема отвергала бы конфиг с `http_client.detour`, а панель
// помечала бы такой узел как непокрытый.
func TestGenerateFlattensEmbeddedInTaggedUnion(t *testing.T) {
	out, err := generate()
	if err != nil {
		t.Fatal(err)
	}

	body := schemaBody(t, out, "HTTPClientSchema")

	for _, want := range []string{"detour:", "bind_interface:", "get tls()"} {
		if !strings.Contains(body, want) {
			t.Errorf("в HTTPClientSchema нет %q: встроенные поля потеряны", want)
		}
	}
}

// schemaBody вырезает объявление схемы по имени: искать подстроку по всему
// файлу бессмысленно — те же поля есть у десятков других типов.
func schemaBody(t *testing.T, out, name string) string {
	t.Helper()

	const marker = "\nexport const "

	start := strings.Index(out, marker+name+" = ")
	if start == -1 {
		t.Fatalf("в схеме нет %s", name)
	}

	rest := out[start+len(marker):]

	end := strings.Index(rest, marker)
	if end == -1 {
		return rest
	}

	return rest[:end]
}

// Генерация должна быть детерминированной: иначе make schema даёт разный
// файл на одном и том же форке и diff перестаёт что-либо значить.
func TestGenerateIsStable(t *testing.T) {
	first, err := generate()
	if err != nil {
		t.Fatal(err)
	}
	second, err := generate()
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Error("два прогона генератора дали разный результат")
	}
}

// Примеры конфигов из форка — готовый корпус для проверки, что схема
// принимает реальные конфиги. Тест только собирает список: разбор
// идёт на стороне фронта, где схема исполняется.
func TestForkExamplesArePresent(t *testing.T) {
	dir, err := forkDir()
	if err != nil {
		t.Fatal(err)
	}

	var configs []string
	err = filepath.WalkDir(filepath.Join(dir, "examples"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && filepath.Ext(path) == ".json" {
			configs = append(configs, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(configs) == 0 {
		t.Fatal("в форке не нашлось примеров конфигов")
	}
	t.Logf("примеров конфигов в форке: %d", len(configs))
}
