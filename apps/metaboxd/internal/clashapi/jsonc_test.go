package clashapi

import (
	"encoding/json"
	"strings"
	"testing"
)

// Parsing goes over a masked copy and the edit over the original bytes, so
// the length must match to the byte: if the lengths diverge, the offsets diverge.
func TestMaskKeepsLength(t *testing.T) {
	tests := []struct {
		name string
		in   string
	}{
		{"line comment", "{\n  // адрес панели\n  \"a\": 1\n}"},
		{"block comment", "{/* было 2 */\"a\": 1}"},
		{"comma before a bracket", `{"a": [1, 2,], "b": {"c": 1,},}`},
		{"comment inside a string", `{"a": "http://x//y", "b": "/* not a comment */"}`},
		{"empty object", "{}"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := len(mask([]byte(tt.in))); got != len(tt.in) {
				t.Errorf("length %d, expected %d", got, len(tt.in))
			}
		})
	}
}

func TestMaskMakesConfigValidJSON(t *testing.T) {
	tests := []struct {
		name string
		in   string
	}{
		{"line comment", "{\n  \"a\": 1, // хвост строки\n  \"b\": 2\n}"},
		{"whole-line comment", "{\n  // пояснение\n  \"a\": 1\n}"},
		{"block comment", "{\n  /* несколько\n     строк */\n  \"a\": 1\n}"},
		{"comma before a closing bracket", "{\n  \"a\": [1, 2,],\n  \"b\": 3,\n}"},
		{"comment and comma together", "{\n  \"a\": 1, // хвост\n}"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !json.Valid(mask([]byte(tt.in))) {
				t.Errorf("after JSON masking it still does not parse:\n%s", mask([]byte(tt.in)))
			}
		})
	}
}

// A comment and a comma inside a string literal are ordinary characters: blanking
// them would spoil a value that goes into the config.
func TestMaskKeepsStringContent(t *testing.T) {
	in := `{"url": "http://example.com//path", "note": "a, b", "block": "/* text */"}`

	if got := string(mask([]byte(in))); got != in {
		t.Errorf("lines changed:\ngot      %s\nexpected %s", got, in)
	}
}

// Line numbers in error messages are counted by line breaks, so
// a block comment is blanked with spaces and the line breaks stay.
func TestMaskKeepsNewlines(t *testing.T) {
	in := "{/* одна\nдве\nтри */\"a\": 1}"

	if got := strings.Count(string(mask([]byte(in))), "\n"); got != 2 {
		t.Errorf("line breaks %d, expected 2", got)
	}
}

// A comma between members is part of the syntax: by blanking it the mask would break
// a config that was valid before.
func TestMaskKeepsSeparatingComma(t *testing.T) {
	in := `{"a": 1, "b": 2}`

	if got := string(mask([]byte(in))); got != in {
		t.Errorf("got %s, expected %s", got, in)
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
		t.Fatalf("config with comments rejected: %v", err)
	}
	if !added {
		t.Fatal("section not appended")
	}

	if !strings.Contains(string(out), "// панель дописывает сюда секцию сама") {
		t.Error("user comment lost")
	}
	if !strings.Contains(string(out), `"final": "direct",`) {
		t.Error("comma before the bracket lost: the edit rewrote foreign bytes")
	}

	settings, err := Read(out)
	if err != nil {
		t.Fatalf("the appended section cannot be read: %v", err)
	}
	if settings.Address == "" || settings.Secret == "" {
		t.Errorf("section appended incomplete: %+v", settings)
	}
}

// The section exists but is hidden behind comments: the daemon must find it and not
// append a second one.
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
		t.Fatalf("Ensure rejected the config: %v", err)
	}
	if added {
		t.Error("section appended over an existing one")
	}
	if string(out) != in {
		t.Errorf("config changed:\n%s", out)
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
		t.Fatalf("reading rejected a config with comments: %v", err)
	}
	if settings.Address != "127.0.0.1:9090" || settings.Secret != "s3cret" {
		t.Errorf("read %+v", settings)
	}
}
