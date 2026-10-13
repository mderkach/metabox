package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Go does not inherit replace from dependencies, so the generator go.mod repeats
// the fork block as a whole. A desync shows as a compile error like
// `undefined: badoption.Range`, clear but not tied to the cause, while
// a version mismatch within one major branch may even build and
// give a schema from someone else's build. Here the blocks are compared line by line.
func TestReplaceBlockMatchesFork(t *testing.T) {
	dir, err := forkDir()
	if err != nil {
		t.Fatalf("fork directory: %v", err)
	}

	ours := replaceDirectives(t, "go.mod")
	theirs := replaceDirectives(t, filepath.Join(dir, "go.mod"))

	// The replacement of the fork itself is ours: its go.mod has no such line.
	if _, ok := ours[forkModule]; !ok {
		t.Errorf("no replacement of %s: without it upstream is built, not the fork", forkModule)
	}
	delete(ours, forkModule)

	for module, want := range theirs {
		got, ok := ours[module]
		if !ok {
			t.Errorf("the fork replaces %s with %s, the generator does not", module, want)
			continue
		}
		if got != want {
			t.Errorf("%s: generator has %s, fork has %s", module, got, want)
		}
	}

	for module, got := range ours {
		if _, ok := theirs[module]; !ok {
			t.Errorf("the generator replaces %s with %s, the fork has no such replacement", module, got)
		}
	}
}

// replaceDirectives reads go.mod and returns the replacements: the replaced module ->
// what it is replaced with. Both forms of entry are parsed: a separate line and
// a block in parentheses.
func replaceDirectives(t *testing.T, path string) map[string]string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}

	out := map[string]string{}
	inBlock := false

	for raw := range strings.Lines(string(content)) {
		line, _, _ := strings.Cut(raw, "//")
		line = strings.TrimSpace(line)

		switch {
		case line == "replace (":
			inBlock = true
			continue
		case inBlock && line == ")":
			inBlock = false
			continue
		case !inBlock:
			rest, ok := strings.CutPrefix(line, "replace ")
			if !ok {
				continue
			}
			line = rest
		}

		left, right, ok := strings.Cut(line, "=>")
		if !ok {
			continue
		}
		out[strings.TrimSpace(left)] = strings.Join(strings.Fields(right), " ")
	}

	if len(out) == 0 {
		t.Fatalf("no replacement in %s: parsing is broken", path)
	}

	return out
}
