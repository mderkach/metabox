package clashapi

import (
	"encoding/json"
	"strings"
	"testing"
)

// Разбор идёт по маскированной копии, а правка — по исходным байтам, поэтому
// длина обязана совпадать до байта: разошлись длины — разъехались смещения.
func TestMaskKeepsLength(t *testing.T) {
	tests := []struct {
		name string
		in   string
	}{
		{"строчный комментарий", "{\n  // адрес панели\n  \"a\": 1\n}"},
		{"блочный комментарий", "{/* было 2 */\"a\": 1}"},
		{"запятая перед скобкой", `{"a": [1, 2,], "b": {"c": 1,},}`},
		{"комментарий внутри строки", `{"a": "http://x//y", "b": "/* not a comment */"}`},
		{"пустой объект", "{}"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := len(mask([]byte(tt.in))); got != len(tt.in) {
				t.Errorf("длина %d, ожидали %d", got, len(tt.in))
			}
		})
	}
}

func TestMaskMakesConfigValidJSON(t *testing.T) {
	tests := []struct {
		name string
		in   string
	}{
		{"строчный комментарий", "{\n  \"a\": 1, // хвост строки\n  \"b\": 2\n}"},
		{"комментарий целой строкой", "{\n  // пояснение\n  \"a\": 1\n}"},
		{"блочный комментарий", "{\n  /* несколько\n     строк */\n  \"a\": 1\n}"},
		{"запятая перед закрывающей скобкой", "{\n  \"a\": [1, 2,],\n  \"b\": 3,\n}"},
		{"комментарий и запятая вместе", "{\n  \"a\": 1, // хвост\n}"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !json.Valid(mask([]byte(tt.in))) {
				t.Errorf("после маскирования JSON всё ещё не разбирается:\n%s", mask([]byte(tt.in)))
			}
		})
	}
}

// Комментарий и запятая внутри строкового литерала — обычные символы: гасить
// их значит портить значение, которое уедет в конфиг.
func TestMaskKeepsStringContent(t *testing.T) {
	in := `{"url": "http://example.com//path", "note": "a, b", "block": "/* text */"}`

	if got := string(mask([]byte(in))); got != in {
		t.Errorf("строки изменились:\nполучили %s\nожидали  %s", got, in)
	}
}

// Номера строк в сообщениях об ошибках считаются по переводам строк, поэтому
// блочный комментарий гасится пробелами, а переводы строк остаются.
func TestMaskKeepsNewlines(t *testing.T) {
	in := "{/* одна\nдве\nтри */\"a\": 1}"

	if got := strings.Count(string(mask([]byte(in))), "\n"); got != 2 {
		t.Errorf("переводов строк %d, ожидали 2", got)
	}
}

// Запятая между членами — часть синтаксиса: погасив её, маска сломала бы
// конфиг, который до этого был валиден.
func TestMaskKeepsSeparatingComma(t *testing.T) {
	in := `{"a": 1, "b": 2}`

	if got := string(mask([]byte(in))); got != in {
		t.Errorf("получили %s, ожидали %s", got, in)
	}
}

func TestEnsureAcceptsConfigWithComments(t *testing.T) {
	in := `{
  // панель дописывает сюда секцию сама
  "log": { "level": "info" },
  "route": { "final": "direct", }
}`

	out, added, err := Ensure([]byte(in), 9090)
	if err != nil {
		t.Fatalf("конфиг с комментариями отвергнут: %v", err)
	}
	if !added {
		t.Fatal("секция не дописана")
	}

	if !strings.Contains(string(out), "// панель дописывает сюда секцию сама") {
		t.Error("комментарий пользователя потерян")
	}
	if !strings.Contains(string(out), `"final": "direct",`) {
		t.Error("запятая перед скобкой потеряна: правка переписала чужие байты")
	}

	settings, err := Read(out)
	if err != nil {
		t.Fatalf("дописанную секцию не прочитать: %v", err)
	}
	if settings.Address == "" || settings.Secret == "" {
		t.Errorf("секция дописана неполной: %+v", settings)
	}
}

// Секция уже есть, но спрятана за комментариями: демон обязан её найти и не
// дописывать вторую.
func TestEnsureFindsSectionBehindComments(t *testing.T) {
	in := `{
  /* рантайм */
  "experimental": {
    // порт свой
    "clash_api": { "external_controller": "0.0.0.0:9090" }
  }
}`

	out, added, err := Ensure([]byte(in), 9090)
	if err != nil {
		t.Fatalf("Ensure отверг конфиг: %v", err)
	}
	if added {
		t.Error("секция дописана поверх существующей")
	}
	if string(out) != in {
		t.Errorf("конфиг изменён:\n%s", out)
	}
}

func TestReadAcceptsConfigWithComments(t *testing.T) {
	in := `{
  "experimental": {
    // адрес и секрет завёл владелец
    "clash_api": { "external_controller": "127.0.0.1:9090", "secret": "s3cret", }
  }
}`

	settings, err := Read([]byte(in))
	if err != nil {
		t.Fatalf("чтение отвергло конфиг с комментариями: %v", err)
	}
	if settings.Address != "127.0.0.1:9090" || settings.Secret != "s3cret" {
		t.Errorf("прочитали %+v", settings)
	}
}
