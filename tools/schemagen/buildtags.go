package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strings"
)

// Половина протоколов форка регистрируется под build-тегами: без
// with_wireguard в реестре не окажется warp, без with_quic — tuic и
// hysteria2. Собранный без тегов генератор напечатал бы урезанную схему и
// ничем себя не выдал, поэтому набор тегов сверяется с эталоном форка.
//
// Эталон — release/DEFAULT_BUILD_TAGS: этим набором собран Makefile
// форка, и с ним же едут релизные сборки под Linux, включая ту, что стоит на
// целевом устройстве.
const forkTagsFile = "release/DEFAULT_BUILD_TAGS"

func checkBuildTags() error {
	dir, err := forkDir()
	if err != nil {
		return err
	}

	raw, err := os.ReadFile(filepath.Join(dir, forkTagsFile))
	if err != nil {
		return fmt.Errorf("чтение %s: %w", forkTagsFile, err)
	}

	want := tagSet(string(raw))
	have := tagSet(currentBuildTags())

	var missing []string
	for tag := range want {
		if !have[tag] {
			missing = append(missing, tag)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	sort.Strings(missing)

	return fmt.Errorf("генератор собран без тегов форка: %s\n"+
		"без них часть протоколов не попадёт в реестры и схема выйдет урезанной;\n"+
		"собирай через `make schema` — она берёт набор из %s",
		strings.Join(missing, ","), forkTagsFile)
}

// currentBuildTags достаёт -tags из информации о сборке: go записывает их и
// для go run, и для go build.
func currentBuildTags() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	for _, setting := range info.Settings {
		if setting.Key == "-tags" {
			return setting.Value
		}
	}
	return ""
}

func tagSet(raw string) map[string]bool {
	out := map[string]bool{}
	for _, tag := range strings.Split(strings.TrimSpace(raw), ",") {
		if tag = strings.TrimSpace(tag); tag != "" {
			out[tag] = true
		}
	}
	return out
}
