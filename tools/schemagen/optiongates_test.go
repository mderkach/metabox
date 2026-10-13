package main

import (
	"os"
	"path/filepath"
	"testing"
)

// The option table is written by hand, so its consistency is checked: the stub
// of each tag exists in the sources and stands under the "build without the tag" condition.
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
		t.Fatalf("the table has %d options, expected %d", len(gates), len(want))
	}

	for _, gate := range gates {
		if want[gate.option] != gate.tag {
			t.Errorf("%s: tag %q, expected %q", gate.option, gate.tag, want[gate.option])
		}
	}
}

func TestCheckStub(t *testing.T) {
	tests := []struct {
		name   string
		source string
		wantOK bool
	}{
		{"stub under the tag negation", "//go:build !with_x\n\npackage stub\n", true},
		{"a file under the tag itself is not a stub", "//go:build with_x\n\npackage stub\n", false},
		{"file without a build condition", "package stub\n", false},
		{"condition about another tag", "//go:build !with_y\n\npackage stub\n", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "stub.go")
			if err := os.WriteFile(path, []byte(tt.source), 0o600); err != nil {
				t.Fatal(err)
			}

			err := checkStub(path, "with_x")
			if tt.wantOK && err != nil {
				t.Errorf("stub rejected: %v", err)
			}
			if !tt.wantOK && err == nil {
				t.Error("file accepted as a stub, expected a rejection")
			}
		})
	}
}
