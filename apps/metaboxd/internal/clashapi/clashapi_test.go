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

// ensure runs Ensure and requires the result to stay valid JSON:
// the edit goes by bytes, and syntax breaks most easily.
func ensure(t *testing.T, data string) (string, bool) {
	t.Helper()

	out, changed, err := clashapi.Ensure([]byte(data), port)
	if err != nil {
		t.Fatalf("section guarantee: %v", err)
	}
	if !json.Valid(out) {
		t.Fatalf("result is not JSON: %s", out)
	}

	return string(out), changed
}

// A config with an already configured controller is not touched at all: this is
// checked by sha256, not by eye.
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
		t.Fatalf("section guarantee: %v", err)
	}
	if changed {
		t.Error("section declared changed although the controller is already configured")
	}
	if after := sha256.Sum256(out); after != before {
		t.Errorf("sha256 changed:\nwas  %s\nnow  %s", data, out)
	}
}

func TestSectionIsCreatedWhenAbsent(t *testing.T) {
	out, changed := ensure(t, `{"log":{"level":"info"},"outbounds":[{"type":"direct"}]}`)

	if !changed {
		t.Fatal("section not added")
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("address %q, expected 127.0.0.1:9090", got.Address)
	}
	if got.Secret == "" {
		t.Error("new section without a secret: the panel would stay open without authorization")
	}
	if !strings.Contains(out, `"log":{"level":"info"}`) || !strings.Contains(out, `"outbounds":[{"type":"direct"}]`) {
		t.Errorf("original keys damaged: %s", out)
	}
}

func TestClashAPIIsAddedToExistingExperimental(t *testing.T) {
	out, changed := ensure(t, `{"experimental":{"cache_file":{"enabled":true}}}`)

	if !changed {
		t.Fatal("section not added")
	}
	if !strings.Contains(out, `"cache_file":{"enabled":true}`) {
		t.Errorf("neighbouring experimental setting damaged: %s", out)
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if got.Address != "127.0.0.1:9090" || got.Secret == "" {
		t.Errorf("got %+v, expected address and secret", got)
	}
}

// The user created the section without a secret, so authorization is not needed
// for them. Appending a secret would break already configured clients.
func TestEmptyControllerIsFilledWithoutAddingSecret(t *testing.T) {
	out, changed := ensure(t, `{"experimental":{"clash_api":{"external_controller":""}}}`)

	if !changed {
		t.Fatal("empty controller not filled")
	}
	if strings.Contains(out, "secret") {
		t.Errorf("secret appended to an existing section: %s", out)
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("address %q", got.Address)
	}
}

func TestMissingControllerIsAddedWithoutTouchingSecret(t *testing.T) {
	out, changed := ensure(t, `{"experimental":{"clash_api":{"secret":"пользовательский"}}}`)

	if !changed {
		t.Fatal("controller not added")
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if got.Secret != "пользовательский" {
		t.Errorf("secret became %q: user values are not changed", got.Secret)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("address %q", got.Address)
	}
}

// The insertion repeats the indent of the neighbours: the config stays human-readable and does not
// glue into one line.
func TestInsertionKeepsIndentation(t *testing.T) {
	out, _ := ensure(t, "{\n  \"log\": {\n    \"level\": \"info\"\n  }\n}")

	if !strings.Contains(out, "{\n  \"experimental\":") {
		t.Errorf("indent not repeated:\n%s", out)
	}
	if !strings.Contains(out, "\n  \"log\": {\n    \"level\": \"info\"\n  }\n}") {
		t.Errorf("original formatting damaged:\n%s", out)
	}
}

func TestInsertionIntoEmptyObject(t *testing.T) {
	out, changed := ensure(t, `{}`)

	if !changed {
		t.Fatal("section not added to an empty config")
	}

	got, err := clashapi.Read([]byte(out))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if got.Address != "127.0.0.1:9090" {
		t.Errorf("address %q", got.Address)
	}
}

func TestEnsureRejectsBrokenInput(t *testing.T) {
	tests := []struct {
		name string
		data string
	}{
		{"not JSON", `{"log":`},
		{"not an object", `[1,2,3]`},
		{"empty", ``},
		{"experimental is not an object", `{"experimental":42}`},
		{"clash_api is not an object", `{"experimental":{"clash_api":"да"}}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := clashapi.Ensure([]byte(tt.data), port); err == nil {
				t.Error("broken input accepted: a blind byte edit would break the config")
			}
		})
	}
}

// A guarantee applied twice must not accumulate edits.
func TestEnsureIsIdempotent(t *testing.T) {
	once, _ := ensure(t, `{"log":{"level":"info"}}`)
	twice, changed := ensure(t, once)

	if changed {
		t.Error("second pass again considered the section missing")
	}
	if !bytes.Equal([]byte(once), []byte(twice)) {
		t.Errorf("second pass changed bytes:\n%s\n%s", once, twice)
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
		{name: "port only", address: ":9090", want: "http://127.0.0.1:9090"},
		{name: "LAN address", address: "192.168.1.1:9090", want: "http://192.168.1.1:9090"},
		{name: "empty address", address: "", wantErr: true},
		{name: "no port", address: "127.0.0.1", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := clashapi.Settings{Address: tt.address}.BaseURL()

			if tt.wantErr {
				if err == nil {
					t.Errorf("address %q accepted, expected an error", tt.address)
				}

				return
			}
			if err != nil {
				t.Fatalf("address %q: %v", tt.address, err)
			}
			if got != tt.want {
				t.Errorf("got %q, expected %q", got, tt.want)
			}
		})
	}
}

func TestReadMissingSection(t *testing.T) {
	got, err := clashapi.Read([]byte(`{"log":{"level":"info"}}`))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if got.Address != "" || got.Secret != "" {
		t.Errorf("got %+v, expected empty values", got)
	}
}

func TestLogOutput(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   string
	}{
		{"file", `{"log": {"output": "/var/run/sing-box.log"}}`, "/var/run/sing-box.log"},
		{"file in a config with a comment", "{\n// лог\n\"log\": {\"output\": \"box.log\",},}", "box.log"},
		{"stderr stream", `{"log": {"output": "stderr"}}`, ""},
		{"stdout stream", `{"log": {"output": "stdout"}}`, ""},
		{"log disabled", `{"log": {"disabled": true, "output": "/var/run/sing-box.log"}}`, ""},
		{"no section", `{}`, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := clashapi.LogOutput([]byte(tt.config))
			if err != nil {
				t.Fatalf("reading: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %q, expected %q", got, tt.want)
			}
		})
	}
}
