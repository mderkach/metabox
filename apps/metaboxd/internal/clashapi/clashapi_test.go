package clashapi_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"strings"
	"testing"

	"metabox/internal/clashapi"
)

const port = 9090

// ensure прогоняет Ensure и требует, чтобы результат остался корректным JSON:
// правка идёт по байтам, и синтаксис ломается легче всего.
func ensure(t *testing.T, data string) (string, bool) {
	t.Helper()

	out, changed, err := clashapi.Ensure([]byte(data), port)
	if err != nil {
		t.Fatalf("гарантия секции: %v", err)
	}
	if !json.Valid(out) {
		t.Fatalf("результат не JSON: %s", out)
	}

	return string(out), changed
}

// Конфиг с уже настроенным контроллером не трогается вовсе — это
// проверяется по sha256, а не по глазам.
func TestExistingControllerIsUntouched(t *testing.T) {
	data := []byte(`{
  "log": {"level": "info"},
  "experimental": {
    "clash_api": {"external_controller": "0.0.0.0:9090", "secret": "мой-секрет"}
  }
}`)
	before := sha256.Sum256(data)

	out, changed, err := clashapi.Ensure(data, port)
	if err != nil {
		t.Fatalf("гарантия секции: %v", err)
	}
	if changed {
		t.Error("секция объявлена изменённой, хотя контроллер уже настроен")
	}
	if after := sha256.Sum256(out); after != before {
		t.Errorf("sha256 изменился:\nбыло  %s\nстало %s", data, out)
	}
}

func TestSectionIsCreatedWhenAbsent(t *testing.T) {
	out, changed := ensure(t, `{"log":{"level":"info"},"outbounds":[{"type":"direct"}]}`)

	if !changed {
		t.Fatal("секция не добавлена")
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("адрес %q, ожидали 127.0.0.1:9090", got.Address)
	}
	if got.Secret == "" {
		t.Error("новая секция без секрета: панель осталась бы открытой без авторизации")
	}
	if !strings.Contains(out, `"log":{"level":"info"}`) || !strings.Contains(out, `"outbounds":[{"type":"direct"}]`) {
		t.Errorf("исходные ключи пострадали: %s", out)
	}
}

func TestClashAPIIsAddedToExistingExperimental(t *testing.T) {
	out, changed := ensure(t, `{"experimental":{"cache_file":{"enabled":true}}}`)

	if !changed {
		t.Fatal("секция не добавлена")
	}
	if !strings.Contains(out, `"cache_file":{"enabled":true}`) {
		t.Errorf("соседняя настройка experimental пострадала: %s", out)
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if got.Address != "127.0.0.1:9090" || got.Secret == "" {
		t.Errorf("получили %+v, ожидали адрес и секрет", got)
	}
}

// Секцию завёл пользователь и секрет не поставил — значит авторизация ему не
// нужна. Дописать секрет означало бы сломать уже настроенных клиентов.
func TestEmptyControllerIsFilledWithoutAddingSecret(t *testing.T) {
	out, changed := ensure(t, `{"experimental":{"clash_api":{"external_controller":""}}}`)

	if !changed {
		t.Fatal("пустой контроллер не заполнен")
	}
	if strings.Contains(out, "secret") {
		t.Errorf("секрет дописан существующей секции: %s", out)
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("адрес %q", got.Address)
	}
}

func TestMissingControllerIsAddedWithoutTouchingSecret(t *testing.T) {
	out, changed := ensure(t, `{"experimental":{"clash_api":{"secret":"пользовательский"}}}`)

	if !changed {
		t.Fatal("контроллер не добавлен")
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if got.Secret != "пользовательский" {
		t.Errorf("секрет стал %q: пользовательские значения не меняются", got.Secret)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("адрес %q", got.Address)
	}
}

// Вставка повторяет отступ соседей: конфиг остаётся читаемым человеком, а не
// склеивается в одну строку.
func TestInsertionKeepsIndentation(t *testing.T) {
	out, _ := ensure(t, "{\n  \"log\": {\n    \"level\": \"info\"\n  }\n}")

	if !strings.Contains(out, "{\n  \"experimental\":") {
		t.Errorf("отступ не повторён:\n%s", out)
	}
	if !strings.Contains(out, "\n  \"log\": {\n    \"level\": \"info\"\n  }\n}") {
		t.Errorf("исходное форматирование пострадало:\n%s", out)
	}
}

func TestInsertionIntoEmptyObject(t *testing.T) {
	out, changed := ensure(t, `{}`)

	if !changed {
		t.Fatal("секция не добавлена в пустой конфиг")
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("адрес %q", got.Address)
	}
}

func TestEnsureRejectsBrokenInput(t *testing.T) {
	tests := []struct {
		name string
		data string
	}{
		{"не JSON", `{"log":`},
		{"не объект", `[1,2,3]`},
		{"пусто", ``},
		{"experimental не объект", `{"experimental":42}`},
		{"clash_api не объект", `{"experimental":{"clash_api":"да"}}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := clashapi.Ensure([]byte(tt.data), port); err == nil {
				t.Error("битый вход принят: правка байт вслепую сломала бы конфиг")
			}
		})
	}
}

// Дважды применённая гарантия не должна накапливать правки.
func TestEnsureIsIdempotent(t *testing.T) {
	once, _ := ensure(t, `{"log":{"level":"info"}}`)
	twice, changed := ensure(t, once)

	if changed {
		t.Error("второй проход снова счёл секцию отсутствующей")
	}
	if !bytes.Equal([]byte(once), []byte(twice)) {
		t.Errorf("второй проход изменил байты:\n%s\n%s", once, twice)
	}
}

func TestBaseURL(t *testing.T) {
	tests := []struct {
		name    string
		address string
		want    string
		wantErr bool
	}{
		{name: "loopback", address: "127.0.0.1:9090", want: "http://127.0.0.1:9090"},
		{name: "wildcard IPv4", address: "0.0.0.0:9090", want: "http://127.0.0.1:9090"},
		{name: "wildcard IPv6", address: "[::]:9090", want: "http://127.0.0.1:9090"},
		{name: "только порт", address: ":9090", want: "http://127.0.0.1:9090"},
		{name: "адрес в LAN", address: "192.168.1.1:9090", want: "http://192.168.1.1:9090"},
		{name: "пустой адрес", address: "", wantErr: true},
		{name: "без порта", address: "127.0.0.1", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := clashapi.Settings{Address: tt.address}.BaseURL()

			if tt.wantErr {
				if err == nil {
					t.Errorf("адрес %q принят, ожидали ошибку", tt.address)
				}

				return
			}
			if err != nil {
				t.Fatalf("адрес %q: %v", tt.address, err)
			}
			if got != tt.want {
				t.Errorf("получили %q, ожидали %q", got, tt.want)
			}
		})
	}
}

func TestReadMissingSection(t *testing.T) {
	got, err := clashapi.Read([]byte(`{"log":{"level":"info"}}`))
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if got.Address != "" || got.Secret != "" {
		t.Errorf("получили %+v, ожидали пустые значения", got)
	}
}

func TestLogOutput(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   string
	}{
		{"файл", `{"log": {"output": "/var/run/sing-box.log"}}`, "/var/run/sing-box.log"},
		{"файл в конфиге с комментарием", "{\n// лог\n\"log\": {\"output\": \"box.log\",},}", "box.log"},
		{"поток stderr", `{"log": {"output": "stderr"}}`, ""},
		{"поток stdout", `{"log": {"output": "stdout"}}`, ""},
		{"лог выключен", `{"log": {"disabled": true, "output": "/var/run/sing-box.log"}}`, ""},
		{"секции нет", `{}`, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := clashapi.LogOutput([]byte(tt.config))
			if err != nil {
				t.Fatalf("чтение: %v", err)
			}
			if got != tt.want {
				t.Errorf("получили %q, ожидали %q", got, tt.want)
			}
		})
	}
}
