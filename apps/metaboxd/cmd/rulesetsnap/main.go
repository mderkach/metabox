// Command rulesetsnap собирает снимок каталога наборов, который встраивается в
// бинарь демона. Снимок — то, с чем демон стартует, пока не сверился с
// поставщиками сам: без него каталог на роутере без интернета был бы пуст.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"metabox/internal/ruleset"
)

const requestTimeout = 30 * time.Second

func main() {
	out := flag.String("out", "", "path of the snapshot file")
	flag.Parse()

	if *out == "" {
		fmt.Fprintln(os.Stderr, "rulesetsnap: -out is required")
		os.Exit(2)
	}

	github := ruleset.NewGitHub(ruleset.GitHubAPI, "metabox-rulesetsnap", requestTimeout)

	data, err := ruleset.Snapshot(context.Background(), github, time.Now())
	if err != nil {
		fmt.Fprintln(os.Stderr, "rulesetsnap:", err)
		os.Exit(1)
	}

	if err := os.WriteFile(*out, append(data, '\n'), 0o600); err != nil {
		fmt.Fprintln(os.Stderr, "rulesetsnap:", err)
		os.Exit(1)
	}
}
