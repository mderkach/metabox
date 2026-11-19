## Context

See proposal.md, "Why". Facts the design rests on, checked in the fork sources (`sing-box-extended` 2.7.3 pinned in `tools/schemagen/go.mod`; the router runs 2.7.2, and the files below behave the same in both, though `provider.go` and `cache.go` differ in the start interface):

- `parser/link/vless.go` writes `x_padding_bytes: 0` when a link has no `extra.xPaddingBytes`; the flat `x_padding_bytes=` parameter is ignored. The transport replaces the zero with 100-1000 at run time, so the node works.
- `option/v2ray_transport.go` rejects `From <= 0 || To <= 0` with `x_padding_bytes cannot be disabled` and cannot tell "not set" from zero.
- `provider/remote/provider.go`, `Start`: a cached entry that fails to parse returns `restore cached outbound provider`, and the core start fails. There is no fallback to a download, unlike `route/rule/rule_set_remote.go` (`restore cached rule-set, will refetch`).
- `experimental/cachefile/cache.go`: bbolt; subscriptions live in the bucket `rule_set` under the provider tag, shared with remote rule sets; with `cache_id` the bucket is nested in a top-level bucket named `0x00` + `cache_id`. The path is `experimental.cache_file.path`, default `cache.db`, resolved from the working directory (`-D`). The core holds the file lock while it runs. On `ErrInvalid`, `ErrChecksum`, `ErrVersionMismatch` or a failed database check the fork deletes the file itself.
- Without the cache, remote rule sets download at start and the first failure is fatal (`initial rule-set`). With `download_detour` through subscription nodes a missing cache probably fails the first start; deleting one entry keeps the rule sets.
- `metabox-singbox`: `stop` removes the dataplane, `restart` kills only the `sing-box` instance and runs `start`. `respawn` uses procd defaults.
- `apply.Manager.rollback` (`apps/metaboxd/internal/apply/cycle.go`) restarts without `awaitProcess` or `health.Wait`; `Plane` rollback (`plane.go`) reloads the same way.
- The daemon may read the config only through the bounded projections in `internal/clashapi` (Architecture&Style.md, "Bounded read-only config projections").

## Goals / Non-Goals

**Goals:**

- A rollback never reports `rolled_back` for a core that is down.
- A crash with the poisoned-cache signature is repaired by the daemon without SSH, keeping the rest of the cache and interception.
- The repair is narrow enough to remove when the fork fixes the cause, and a fork bump shows when that happens.

**Non-Goals:**

- Detecting a poisoned entry before the core crashes.
- Repairing other start failures of the core.

## Decisions

### Where the mechanism lives

The daemon, not the init script. The init script would need a bbolt tool on the router, and it cannot read the crash reason the way the daemon already does (`singbox.Client.failure`: logread, then `log.output`). The init script only gains a command that stops the `sing-box` instance and keeps the dataplane: the first half of its `restart`. Its name is settled in the implementation; the daemon calls it through `singbox.Client` like `restart` and `reload`, never `stop`, which removes interception.

Packages:

- a new `internal/cachefile` (name settled in the implementation): open the file with a lock timeout, delete one key in `rule_set` (top level or under `0x00` + `cache_id`), move the file aside. It is the only importer of bbolt.
- `internal/clashapi`: a new bounded projection of `experimental.cache_file` (`enabled`, `path`, `cache_id`, `store_subscriptions`), with a row in the projection table of Architecture&Style.md and tests that the original bytes are kept.
- `internal/singbox`: recognises the signature in the crash reason and returns the provider tag. The tag is the text between `provider/remote[` and the last `]: restore cached outbound provider`, so a tag with `]` still parses. The key is confirmed by its presence in the bucket; `providers[]` is not read.
- `internal/apply`: the orchestration, as a `Manager` method, because it needs the apply slot, the service, the store and the healthcheck that the manager already owns. Holding the slot makes a parallel Apply get `ErrBusy` instead of racing for the service.

Rejected: a separate supervisor package with its own service handle. It would duplicate the healthcheck wiring and need its own lock against Apply.

### Honest rollback

`rollback` calls `awaitProcess` with the pid taken before the restart, then `health.Wait` with the Clash API settings of the restored config (`clashapi.Read` on the restored bytes, not the candidate's). A failure joins the restart error path: `rollback_failed`, the reason carries the crash reason, `lastSum` is reset as today. DNS and interception probes are not repeated: the rollback has nothing to roll back to, and the question is only whether the core runs. The same check goes into `Plane` rollback if the owner agrees (proposal, open questions).

### Recovery flow

1. A trigger sees a failed healthcheck or a failed service, reads the crash reason and matches the signature. No match: nothing else happens.
2. Read the running config, take the cache projection. `enabled` false or `store_subscriptions` false: the signature cannot come from this config; stop and report.
3. Stop the `sing-box` instance through the new init command and wait until procd reports no process.
4. Open the cache file with a lock timeout. Timeout: the file is untouched, start the service, report. Another open error: move the file aside (AC-93), start the service.
5. Delete the key of the tag. Absent key: start the service, report; do not search other buckets.
6. Start the service, wait for a new process and the Clash API. A new signature with a tag not dropped yet: repeat from step 3. The same tag or another failure: report.

Triggers:

- the rollback restart (AC-91 failure with the signature): recovery runs inside the rollback, under the same slot; success closes the transaction as `rolled_back` with the dropped tag in the reason;
- `POST /api/service/start` and `/restart`: after the action the handler waits for the healthcheck and runs recovery on the signature, then answers with the state;
- daemon start, after both replays: in a goroutine owned by `main`, cancelled by the root context, under the apply slot. It waits for the service with the cycle timeout, but stops waiting as soon as the crash reason carries the signature.

### Moving a file aside

Renamed to `<file>.broken` in the same directory: one fixed name, replaced on every move, so repeated moves do not fill the flash. The name does not end in `.json`.

### Dependency

`go.etcd.io/bbolt` v1.5.0, the upstream of the fork's `github.com/sagernet/bbolt`. Measured on 2026-11-19, `linux/arm64`, `-trimpath -ldflags="-s -w"`: a program that opens a database and deletes a key is 1.97 MB against 1.31 MB without bbolt, the same for both modules; the only indirect module is `golang.org/x/sys`, already required by the daemon. The decision, the rejected options and the condition for removal: [ADR-0086](../../../docs/adr/ADR-0086-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md).

### Fork pin test

`tools/schemagen/cachefile_test.go`, after the pattern of `provider_test.go`, two tests:

- one decodes a VLESS xHTTP outbound with `"x_padding_bytes": 0` through `option.Options` and expects `x_padding_bytes cannot be disabled`;
- one writes a subscription entry the fork cannot parse into a cache file through the fork's own `SaveSubscription`, starts the core with that cache and expects the start to fail with `restore cached outbound provider`.

The second test also writes the fixture `cache.db` the daemon tests read, so the daemon is tested against a file in the fork's format. Where the fixture is committed is settled in the implementation; it is regenerated by a `make` target, not by hand.

## Risks / Trade-offs

- [Deleting a cache entry the user did not ask to delete] → only on the exact signature, only the key named by the core, logged with the tag; the next background update refills it.
- [A refilled entry is poisoned again: the subscription still returns the bad link] → the core runs until the next restart, and recovery repeats then. The fix belongs to the subscription source or the fork; recovery only keeps the router reachable.
- [Library divergence: the daemon's bbolt edits a file the fork's bbolt then rejects] → the fork deletes a file it cannot open; the fixture test from the fork's writer catches a format change on a fork bump.
- [The daemon holds the apply slot at boot for up to the cycle timeout] → Apply answers `ErrBusy` for that time; the wait ends early on a running core or the signature.
- [The signature text changes in a fork release] → the pin test asserts the text; a change fails `make test-schemagen` before the bump ships.
- [The fallback probably fails the first start on `initial rule-set`] → recorded as an open question; the core is down in that case anyway.

## Migration Plan

No data migration. The new init command ships in the same package as the daemon, so a daemon never calls a script without it. Rolling back the package returns the old rollback behaviour; a file moved aside stays as `<file>.broken` and can be removed by hand.

## Open Questions

Listed in proposal.md, "Open questions": they change specs or tasks and must be answered before the work starts.
