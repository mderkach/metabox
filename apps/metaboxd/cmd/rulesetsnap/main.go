// Command rulesetsnap builds a snapshot of the rule set catalog that is embedded into
// the daemon binary. The snapshot is what the daemon starts with before it has checked with
// the providers itself: without it the catalog on a router without internet would be empty.
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
