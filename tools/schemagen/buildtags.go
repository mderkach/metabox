package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strings"
)

// Without the with_wireguard tag the warp type disappears from the endpoint registry:
// include/wireguard.go registers both wireguard and warp, while
// include/wireguard_stub.go registers only wireguard. The other stubs of the fork
// register the same option types as the main files, so tags affect the composition of
// the schema in exactly this one place (measured by an A/B run).
// A generator built without tags would print a schema without warp and give no sign of
// it, so the set is checked against the fork's reference.
//
// The reference is release/DEFAULT_BUILD_TAGS: the fork's Makefile is built with this set,
// and the Linux release builds, including the one on the
// target device, ship with it.
const forkTagsFile = "release/DEFAULT_BUILD_TAGS"

func checkBuildTags() error {
	dir, err := forkDir()
	if err != nil {
		return err
	}

	raw, err := os.ReadFile(filepath.Join(dir, forkTagsFile))
	if err != nil {
		return fmt.Errorf("reading %s: %w", forkTagsFile, err)
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

	return fmt.Errorf("generator built without the fork tags: %s\n"+
		"without them some protocols will not get into the registries and the schema will come out truncated;\n"+
		"build through `make schema`, it takes the set from %s",
		strings.Join(missing, ","), forkTagsFile)
}

// currentBuildTags extracts -tags from the build info: go records them for
// both go run and go build.
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
