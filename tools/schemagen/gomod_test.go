package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Go не наследует replace из зависимостей, поэтому go.mod генератора повторяет
// блок форка целиком. Рассинхрон проявляется ошибкой компиляции вида
// `undefined: badoption.Range` — понятной, но не связываемой с причиной, а
// расхождение версии внутри одной мажорной ветки может и вовсе собраться и
// дать схему от чужой сборки. Здесь блоки сверяются построчно.
func TestReplaceBlockMatchesFork(t *testing.T) {
	dir, err := forkDir()
	if err != nil {
		t.Fatalf("каталог форка: %v", err)
	}

	ours := replaceDirectives(t, "go.mod")
	theirs := replaceDirectives(t, filepath.Join(dir, "go.mod"))

	// Замена самого форка — наша: в его go.mod такой строки нет.
	if _, ok := ours[forkModule]; !ok {
		t.Errorf("нет замены %s: без неё собирается upstream, а не форк", forkModule)
	}
	delete(ours, forkModule)

	for module, want := range theirs {
		got, ok := ours[module]
		if !ok {
			t.Errorf("форк заменяет %s на %s, а генератор — нет", module, want)
			continue
		}
		if got != want {
			t.Errorf("%s: у генератора %s, у форка %s", module, got, want)
		}
	}

	for module, got := range ours {
		if _, ok := theirs[module]; !ok {
			t.Errorf("генератор заменяет %s на %s, а форк такой замены не держит", module, got)
		}
	}
}

// replaceDirectives читает go.mod и возвращает замены: заменяемый модуль ->
// то, на что он заменён. Разбираются обе формы записи — отдельной строкой и
// блоком в скобках.
func replaceDirectives(t *testing.T, path string) map[string]string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("чтение %s: %v", path, err)
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
		t.Fatalf("в %s нет ни одной замены: разбор сломан", path)
	}

	return out
}
