package main

import (
	"os"
	"path/filepath"
	"testing"
)

// Таблица опций записана руками, поэтому проверяется её растяжка: заглушка
// каждого тега существует в исходниках и стоит под условием «сборка без тега».
func TestBuildOptionGates(t *testing.T) {
	gates, err := buildOptionGates()
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]string{
		"tls.utls":               "with_utls",
		"tun.stack":              "with_gvisor",
		"experimental.clash_api": "with_clash_api",
		"experimental.v2ray_api": "with_v2ray_api",
	}

	if len(gates) != len(want) {
		t.Fatalf("в таблице %d опций, ожидали %d", len(gates), len(want))
	}

	for _, gate := range gates {
		if want[gate.option] != gate.tag {
			t.Errorf("%s: тег %q, ожидали %q", gate.option, gate.tag, want[gate.option])
		}
	}
}

func TestCheckStub(t *testing.T) {
	tests := []struct {
		name   string
		source string
		wantOK bool
	}{
		{"заглушка под отрицанием тега", "//go:build !with_x\n\npackage stub\n", true},
		{"файл под самим тегом — не заглушка", "//go:build with_x\n\npackage stub\n", false},
		{"файл без условия сборки", "package stub\n", false},
		{"условие про другой тег", "//go:build !with_y\n\npackage stub\n", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "stub.go")
			if err := os.WriteFile(path, []byte(tt.source), 0o600); err != nil {
				t.Fatal(err)
			}

			err := checkStub(path, "with_x")
			if tt.wantOK && err != nil {
				t.Errorf("заглушка отвергнута: %v", err)
			}
			if !tt.wantOK && err == nil {
				t.Error("файл принят заглушкой, ожидали отказ")
			}
		})
	}
}
