# Go testing

Only `testing` from the standard library. The daemon module has no dependencies besides the MCP SDK and will not get them for assertions: `require` in `go.mod` is a separate decision ([Architecture&Style](./Architecture&Style.md)), and testify itself adds its own dialect on top of the language and breaks the semantics of `t.Fatal` in goroutines. Comparison is a plain `if`, the difference is printed as a message with got and want.

## Layout

```text
internal/apply/
├── transaction.go
├── transaction_test.go
└── testdata/
    └── config.golden.json
```

A test sits next to the code. `package apply` when internals are needed; `package apply_test` when the public contract is checked, and that is the preferred option for packages that someone imports.

The function name is in Latin letters, named after the behaviour under test. Subtest names and failure messages are in English and read as a statement: `t.Run("check failure leaves the file unchanged", ...)`. An existing example: [`tools/schemagen/generate_test.go:13`](../../../../tools/schemagen/generate_test.go).

Fixture files go in `testdata/`: Go tools ignore this directory.

## Tables

```go
func TestOriginAllowed(t *testing.T) {
 tests := []struct {
  name   string
  origin string
  host   string
  want   bool
 }{
  {"own origin", "http://192.168.1.1", "192.168.1.1", true},
  {"foreign origin", "http://evil.example", "192.168.1.1", false},
  {"origin missing", "", "192.168.1.1", false},
 }

 for _, tt := range tests {
  t.Run(tt.name, func(t *testing.T) {
   if got := originAllowed(tt.origin, tt.host); got != tt.want {
    t.Errorf("origin %q with host %q: got %v, want %v", tt.origin, tt.host, got, tt.want)
   }
  })
 }
}
```

`t.Errorf` when the checks in a subtest are independent, `t.Fatalf` when going further makes no sense. Copying the loop variable is not needed: since Go 1.22 each iteration has its own.

`t.Parallel()` is added deliberately. Tests that write to one directory or call a shared service fake are not made parallel.

## testing tools

| What you need                     | How                                                     |
| --------------------------------- | ------------------------------------------------------- |
| A directory for files             | `t.TempDir()`: cleaned up automatically                 |
| Teardown on completion            | `t.Cleanup(func() { ... })`                             |
| A context for the code under test | `t.Context()`: cancelled when the test ends             |
| An environment variable           | `t.Setenv` (incompatible with `t.Parallel`)             |
| Working directory                 | `t.Chdir`                                               |
| Files to inspect after the run    | `t.ArtifactDir()` (Go 1.26), with the `-artifacts` flag |

Own helpers are marked with `t.Helper()`, otherwise a failure points at the helper's line, not at the test.

## File tests

Everything that writes to disk works in `t.TempDir()`. Not only the result is checked, but also that on failure the target file was not harmed:

```go
before, err := os.ReadFile(cfgPath)
if err != nil {
 t.Fatal(err)
}

if err := store.Write(brokenCandidate); err == nil {
 t.Fatal("broken candidate was written")
}

after, err := os.ReadFile(cfgPath)
if err != nil {
 t.Fatal(err)
}
if !bytes.Equal(before, after) {
 t.Error("file changed after a failed write")
}
```

The absence of a `.json` suffix on the temporary file and a matching `sha256` when applying a config that already has a `clash_api` section are mandatory checks.

## Boundaries instead of mocks

External things are replaced with a fake through an interface declared on the consumer side: running commands, managing the service, the clock. A fake is a simple struct with response fields; we do not use mock generators.

```go
type fakeRunner struct {
 exitCode int
 stderr   string
 calls    [][]string
}

func (f *fakeRunner) Run(ctx context.Context, args ...string) (Result, error) {
 f.calls = append(f.calls, args)
 ...
}
```

We do not mock our own logic. Calling the real `sing-box` is the level of integration tests, not unit tests.

## Time and concurrency

The confirmation window is 60 seconds, the automatic rollback waits for it to expire. A test does not sleep: `testing/synctest` (stable since Go 1.25) gives a bubble with a fake clock where time moves instantly when all goroutines are blocked.

```go
func TestRollbackAfterDeadline(t *testing.T) {
 synctest.Test(t, func(t *testing.T) {
  tx := startApply(t.Context())

  time.Sleep(61 * time.Second)
  synctest.Wait()

  if tx.State() != StateRolledBack {
   t.Errorf("state %v, want rollback", tx.State())
  }
 })
}
```

In the example `startApply` is built on fakes of the store and the command runner: only the transaction logic with its timers gets into the bubble. Real disk, network and external processes are not taken in: operations outside the bubble do not count as blocking, the fake clock does not move during them, and determinism is lost.

Inside the bubble `time.Sleep`, timers and `context.WithTimeout` run on the fake clock; `synctest.Wait` waits until all goroutines of the bubble are blocked.

Everything that starts goroutines is run with `-race`: `go test -race ./...`. The same run goes in CI ([`ci.yml`](../../../../.github/workflows/ci.yml)). `make test` does not enable the detector: it also runs the frontend, and doubling the time of every local run is not worth it, so the author runs a change with goroutines with `-race` personally.

## HTTP

```go
srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, nil, testLogger(t), httpapi.Options{}))
defer srv.Close()
```

An end-to-end check through `httptest.NewServer` is used when the middleware chain matters (`Host`, `Origin`, panic, logs). A single handler is checked directly with `httptest.NewRecorder`, without starting a server. The status, `Content-Type` and the parsed body are checked, not the whole response bytes.

## Golden files

For the config round trip and the schema generator: the result is compared with a reference from `testdata/`. The reference is updated with a separate flag (`-update`), not by hand, otherwise the reference gets fitted to a bug.

Determinism is checked separately: two runs must give the same result ([`generate_test.go:39`](../../../../tools/schemagen/generate_test.go)).

## Integration tests

The test bench runs the independent environment check `apply-cycle-check` inside the `target` container (`make up`, `make apply-check`). In CI, the `integration` job additionally runs [`apply_integration_test.go`](../../apply_integration_test.go) from the host against the real daemon, Store, sing-box and procd over HTTP, before `make reach-check` and `make dataplane-check` ([`ci.yml`](../../../../.github/workflows/ci.yml)).

A Go test that needs procd, the sing-box binary and `/etc/sing-box` is separated with the `//go:build integration` build tag: the host has none of these, and `make test` must not break there.

The test bench check `apply-cycle-check` ([`.devcontainer/target/files/usr/bin/apply-cycle-check`](../../../../.devcontainer/target/files/usr/bin/apply-cycle-check)) stays independent of the daemon: it checks the environment itself.

On the host, without a tag, [`internal/apply/http_test.go`](../../internal/apply/http_test.go) runs the Apply transaction through the HTTP handlers and the real `config.Store` in `t.TempDir()`, with the service and `sing-box check` scripted. It cuts the power of a daemon instance at the boundaries between the steps of the cycle, Confirm and the rollback (a torn write inside a step is not simulated), and a fresh instance on the same directories replays the journal; the disk, the journal and the API answers are checked after both.

The HTTP suite requires both `CI=true` and `METABOX_EPHEMERAL_BENCH=1`, checks the Compose target identity and refuses an active transaction or a nonstandard fixture. It changes the disposable CI config and restarts the daemon: do not enable it on an owner's bench. It covers confirmation, invalid-candidate rejection, timeout rollback, restoration of a confirmation window after restart and a graceful interruption after the config write at a test-only restart barrier. Polls of real external processes use bounded wall-clock deadlines, since they cannot run inside `synctest`. The fixture is restored on failure too. This does not simulate a power loss or prove directory `fsync` on a device's overlayfs; AC-14 and AC-29 require their own evidence. The harness choice is [ADR-0067](../../../../docs/adr/ADR-0067-test-http-apply-on-the-disposable-ci-bench.md).

## Benchmarks

`for b.Loop() { ... }` (Go 1.24) instead of `for i := 0; i < b.N; i++`: the timer and protection against the optimizer dropping the call are built in. Benchmarks are written for a specific NFR threshold, not "just in case".

## Commands

| What                          | Command               |
| ----------------------------- | --------------------- |
| Daemon tests                  | `go test ./...`       |
| Races                         | `go test -race ./...` |
| Generator tests               | `make test-schemagen` |
| Everything (Go + frontend)    | `make test`           |
| Apply cycle on the test bench | `make apply-check`    |

The generator is a separate module: `go test ./...` from the root does not see it, and it builds only with the fork's tags and `-ldflags`. So it has its own target in the [Makefile](../../../../Makefile).
