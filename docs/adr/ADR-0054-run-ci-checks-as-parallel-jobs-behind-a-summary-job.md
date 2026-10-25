# ADR-0054. Run CI checks as parallel jobs behind a summary job and key the Go cache by the tool pins

- Status: Proposed
- Date: 2026-10-20
- Deciders: repository owner

## Context and problem statement

CI (`.github/workflows/ci.yml`) is mandatory for every change: the `main` branch rule requires the `checks` and `integration` jobs ([CONTRIBUTING.md](../../CONTRIBUTING.md), section "PR"). `checks` ran every step in one job: Go lint over both modules, daemon tests with `-race`, generator tests, web lint, format, tests, build and the full daemon build. The run of `main` 39470699173 (2026-10-20) took 8 min 18 s; `integration` finished in 33 s next to it.

Measured on that run, three steps cost two minutes each, and none depends on another:

| Step                     | Time  |
| ------------------------ | ----- |
| Go lint                  | 125 s |
| Schemagen tests          | 129 s |
| `pnpm --filter web test` | 139 s |
| `go test -race`          | 29 s  |
| everything else          | ~75 s |

Two of those minutes were spent downloading, not checking. `setup-go` keyed its cache by `tools/schemagen/go.sum` alone, and that file does not change between runs: the cache was saved once and never again, so golangci-lint (`go run …@v2.13.2` in the `Makefile`) and its modules were fetched on every run. The logs confirm it: a cache hit, then `go: downloading` for the linter's modules. The fetch is also the only network dependency of the lint step. On 2026-10-20 the first attempt of PR #8 failed in it:

```
github.com/securego/gosec/v2@v2.28.0: verifying module: reading https://sum.golang.org/tile/8/0/x224/084: stream error: stream ID 657; INTERNAL_ERROR
```

The workflow also ran on `push` and `pull_request` without filters, so each push to a branch with a PR started two identical runs.

Constraints: the branch rule names the contexts `checks` and `integration`, and renaming a job means editing the rule in the same change; the GitHub-hosted runner has 2 cores, so the web tests take five times longer than on a developer machine; the repository avoids new dependencies, including actions, when the existing ones suffice.

Out of scope: sharding the web tests, a self-hosted runner, running `integration` on the device image, tracking fork releases (ADR-0044).

## Decision drivers

1. Wall time of a PR run: the loop from push to a mergeable PR.
2. Reliability: a run must not fail on a module download when nothing changed.
3. The `main` branch rule keeps working without edits, and a failed check can never pass through it.
4. No new actions or tools.
5. The steps and their commands stay the same as `pre-push`, so local and CI checks do not diverge.

## Considered options

1. **Parallel jobs `go`, `schemagen`, `web` and a summary job `checks` with `needs` on all three.** `checks` runs with `if: always()` and fails when any dependency did not succeed: a job skipped because of a failed dependency counts as passed for a branch rule, so a plain `needs` without `always()` would let a red run through. The Go cache key includes `Makefile` and both module manifests, so a change of the linter pin or a dependency resaves it. `push` is limited to `main`, and a `concurrency` group cancels the run of a superseded commit. Drawbacks: three runners set up the toolchain instead of one, which costs minutes of runner time though not wall time; `web` still needs Go for `make daemon`. **Chosen**: meets drivers 1–5.
2. **Keep one job, fix only the cache key.** Removes the download and its failure mode. Drawbacks: the three two-minute steps stay sequential, so the run stays above six minutes; double runs stay. **Rejected**: driver 1.
3. **One job, cache fix, and `golangci/golangci-lint-action` with its own cache.** The action caches the linter binary and analysis results. Drawbacks: a new action, a second place that pins the linter version next to the `Makefile`, and the lint command in CI stops being `make lint`. **Rejected**: drivers 4 and 5.
4. **Keep the current approach.** 8–9 minutes per run, a network-dependent lint step, two runs per push. **Rejected**: drivers 1 and 2.

## Decision outcome

- `ci.yml` has the jobs `go` (`make lint`, `go test -race ./...` in the daemon), `schemagen` (`make test-schemagen`), `web` (commitlint on PRs, `pnpm lint`, `pnpm format:check`, web tests and build, react-doctor advice, `make daemon`), `checks` (summary) and `integration` (unchanged).
- `checks` depends on `go`, `schemagen`, `web`, `web-browser` and `integration`, runs with `if: always()` and exits non-zero when any of them ended in `failure`, `cancelled` or `skipped`. Its name is the only context the branch rule needs; the rule also names `integration`, which the owner may drop. Until 2026-10-25 `checks` did not wait for `integration`, and a PR showed a green summary while the integration job was still running or hung.
- Every job has `timeout-minutes` sized from the 60 runs before 2026-10-25 with a margin: `go` 30 (longest success 19 min, median about 1), `schemagen` 20 (3.5 min cold), `web` 30 (23 min), `web-browser` 15 (1.3 min), `checks` 5, `integration` 30 (15 min; the long outliers are runner stalls between steps, not slow steps). The integration steps that run the test bench have their own limits: `Environment` 10, `Daemon ready` 3, `Apply cycle` and `Reach check` 5, `Dataplane check` 10. The release, apk-repo and fork-release-watch jobs get 30, 20 and 15. Without a limit a hung step holds the concurrency group: on 2026-10-24 the `Dataplane check` step of run 40116156272 hung for over three hours, the pending runs of ten pushes to `main` were cancelled by the group, and tag v0.1.0-rc.9 was cut from a commit with no CI verdict.
- The release workflow refuses a tag whose commit's latest `checks` check run is not `success` (the commit check-runs API, which also shows a cancelled or still running CI); being on `main` was the only condition before. The fix for a refused tag is to re-run the release once CI on `main` is green.
- Each job lists in `cache-dependency-path` the files that decide what it downloads: `go` lists `Makefile`, both `go.mod` files and `tools/schemagen/go.sum`; `schemagen` lists the generator's `go.mod` and `go.sum`; `web` runs with `cache: false`, because the daemon has no external modules. `setup-go` saves a cache once per key, so no two jobs may share a key: the first job to finish would save a cache without the other job's modules.
- The `Makefile` downloads the fork module before `go list -m` reads its directory: on a cold module cache `go list` prints an empty path, and the generator tests ran with no fork tags. One job hid this because `make lint` downloaded the fork first.
- The workflow runs on `pull_request` and on `push` to `main` only. A `concurrency` group keyed by the PR number, or the ref outside a PR, cancels the run in progress when a new commit arrives to a PR; a run in progress on `main` is never cancelled, but GitHub keeps one pending run per group, so a newer push to `main` replaces a pending one and that merge commit gets no verdict.
- A new check joins one of the three jobs by what it needs, not a new job; a new job is added to `needs` of `checks` in the same change.

## Consequences

### Positive

- The critical path is the longest of the three jobs instead of their sum. Measured on the branch runs of this change:

  | Run                      | `go`      | `schemagen` | `web`      | Workflow   |
  | ------------------------ | --------- | ----------- | ---------- | ---------- |
  | 39475562085, cold caches | 2 min 7 s | 6 min 21 s  | 3 min 12 s | 6 min 30 s |
  | 39477748924, warm caches | 54 s      | 43 s        | 3 min 22 s | 3 min 31 s |

  With warm caches `Go lint` takes 18 s and the generator tests 27 s; `web` is the critical path, and its tests account for most of it.

- The lint step reads the linter from the cache; `sum.golang.org` is not on the path of a run without a dependency change.
- One run per push to a PR branch; a stale run is cancelled.

### Negative

- A push to a branch without a PR is not checked by CI; `pre-push` stays the only check until the PR is opened.
- Three runners install Go per run; runner minutes roughly double while wall time halves. Acceptable for a public repository on the free plan.
- A change to the `Makefile` for any reason invalidates the `go` job cache once.
- A cold cache still downloads through `proxy.golang.org` and `sum.golang.org`; two of the three branch runs of this change failed on a stream error there. A warm cache is the mitigation, not a fix.

### Neutral or deferred

- Sharding the web tests is deferred until `web` is the longest job after this change and its time matters.
- `integration` stays on the public x86-64 rootfs (ADR-0023).

## Compatibility, migration and rollback

The branch rule is untouched: the contexts `checks` and `integration` exist before and after. Rollback is a revert of the workflow commit; the old cache key stays valid, and no other file depends on the job layout. Not applicable to data, configs or clients.

## Validation

- `gh run view <id> --json jobs` on a PR run: jobs `go`, `schemagen`, `web` start at the same time, `checks` completes after them.
- The `Go lint` step log of a run after the cache was saved has no `go: downloading` lines for golangci-lint modules.
- One push to a PR branch produces one run in `gh run list --branch <branch>`.
- A red job makes `checks` fail rather than skip: in run 39473711053 `schemagen` failed and `checks` concluded `failure`.
- `checks` waits for `integration`: in a run where `integration` fails, `checks` concludes `failure`; before this change the `main` commit e5fbcf66 had `integration=failure` next to `checks=success`.
- The release gate: the rc.9 commit 3c770c11 has no `checks` check run at all, so the gate reports `found: none` and exits 1.

## Links

- [CONTRIBUTING.md](../../CONTRIBUTING.md), section "PR": the branch rule and the jobs it names;
- [ADR-0016](./ADR-0016-pin-tool-versions-where-tools-read-them.md): the linter pin lives in the `Makefile`, which is why it keys the cache;
- [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): the integration job and its base image;
- [ADR-0044](./ADR-0044-catch-schema-drift-in-ci-and-at-runtime.md): the fork release tracking that stays out of scope here;
- `.github/workflows/ci.yml`;
- GitHub Docs, [Using jobs in a workflow: `needs`](https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow#defining-prerequisite-jobs) and [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/using-jobs/using-concurrency);
- Runs: 39470699173 (before); 39473711053, 39475562085, 39477748924 (after).
