# Go code review checklist

Go through it before handing in a change to the Go part. The checklist items are not a matter of taste: a deviation from them means the change must not be accepted until the document is explicitly changed.

## Architecture

- [ ] No new dependency appeared in the daemon's `go.mod`.
- [ ] `apps/metaboxd` stayed thin: flag parsing, wiring dependencies, start, shutdown.
- [ ] The package is named by subject, not by layer; no `util`, `common`, `helpers` were created.
- [ ] Dependencies are passed through the constructor, there are no global variables and no `init()`.
- [ ] The interface is declared at the consumer and contains only the methods used.
- [ ] Config parsing stays within the [bounded read-only projection exception](./Architecture&Style.md#bounded-read-only-config-projections), without reverse serialization or a general Go config model.
- [ ] No own validation of config contents was added: the binary checks it.

## Style

- [ ] `gofmt` passed, `make lint` is green.
- [ ] A new exclusion in [`.golangci.yml`](../../../../.golangci.yml) states a reason and does not just silence a noisy rule.
- [ ] `context.Context` is the first argument and is not stored in structs.
- [ ] Only what is used outside the package is exported.
- [ ] Comments follow the "Placement of technical knowledge" rule in [AGENTS.md](../../../../AGENTS.md): godoc covers what is not visible from the signature, without retelling the code.
- [ ] There is no diff unrelated to the task: renames, reformatting, refactoring along the way.

## Errors

- [ ] An error is either returned or logged, never both.
- [ ] `%w` wrapping where the caller reacts to the original error; the context in the text says what was being done.
- [ ] Checks go through `errors.Is` / `errors.AsType`, not through the error text.
- [ ] `Close` and `Sync` errors on the success path of a write are not swallowed.
- [ ] Paths, command arguments and config contents do not leak out over HTTP. The exception is the verbatim output of `sing-box check`
- [ ] There is no `panic` in a request handler or in the apply loop; the recovery middleware is in place.

## Logs

- [ ] The logger comes through the constructor; `slog.Default()` and `log.Printf` are not used.
- [ ] Attributes are key-value pairs, the error is under the `err` key.
- [ ] The level matches the event: a failure for the user is `Error`, a safeguard that fired is `Warn`.
- [ ] The Clash API `secret`, tokens, request bodies and the whole config did not get into logs.
- [ ] One event is one record; there are no duplicates up the stack.

## HTTP

- [ ] The route pattern contains the method; parameters are read with `r.PathValue`.
- [ ] The request body is limited by `http.MaxBytesReader`.
- [ ] `r.Context()` goes into the called code. The apply cycle lives on its own context
- [ ] A mutating request is checked by `Origin` and `Host`; relaxing it is possible only through `-allowed-origin`.
- [ ] Server timeouts are set; `WriteTimeout` is not set globally where there are long responses.
- [ ] An unknown path under `/api/` returns a JSON error, not `index.html`.
- [ ] Shutdown handles the signal and calls `Shutdown`; `http.ErrServerClosed` is not counted as an error.
- [ ] The daemon listens on the address from the flag; `0.0.0.0` did not appear as a default.

## Device

- [ ] A file write is a temporary file in the same directory, `Sync`, `rename`, `Sync` of the directory.
- [ ] The temporary file name does not end in `.json`.
- [ ] A failure before `rename` leaves the target file unchanged, and this is covered by a test.
- [ ] The target file mode is preserved, service files are created with 0600 and live outside the config directory.
- [ ] A path built from an external value goes through `os.Root`; `filepath.Join` does not count as protection.
- [ ] A command runs as a list of arguments, with an absolute path to the binary, without `sh -c`.
- [ ] `exec.CommandContext` has `WaitDelay` set; the output is size-limited; the exit code is taken from `*exec.ExitError`.
- [ ] The service is managed by the init script, not by running the binary directly or by `kill`.
- [ ] A restart of a stopped service is a normal path.
- [ ] The transaction state is written after the backup and before the config, the deadline is stored as a duration, not as absolute time.
- [ ] An unfinished transaction is replayed on start along all three branches.

## Concurrency

- [ ] For every started goroutine it is clear who stops it and where its error goes.
- [ ] A resource has one owner; parallel access is closed off by its methods.
- [ ] Cancellation reaches all steps through `ctx`.
- [ ] The `-race` run is clean: `go test -race ./...` locally, the same step exists in CI.

## Tests

- [ ] New behaviour is covered by a test, and so is failure, not only the success path.
- [ ] No assertion libraries were added.
- [ ] File tests work in `t.TempDir()`.
- [ ] Unit tests wait through `testing/synctest` or a replaceable clock; live integration tests use bounded polling of the real environment as described in [Testing](./Testing.md).
- [ ] A Go test that needs a live environment (procd, the sing-box binary) is tagged `integration` and does not break `make test` on the host. The HTTP Apply suite runs only on the disposable CI bench; the independent environment check stays in `apply-cycle-check`.
- [ ] `make test` was run, the result is quoted as is.
