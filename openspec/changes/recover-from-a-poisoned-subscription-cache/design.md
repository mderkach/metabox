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
- `internal/cachefile` also recognises the signature in the crash reason and returns the provider tag (`PoisonedProvider`), next to the layout it belongs to. Only the last line of the reason counts. The tag is the text between `provider/remote[` and `]: restore cached outbound provider`, so a tag with `]` still parses. The key is confirmed by its presence in the bucket; `providers[]` is not read. `internal/singbox` gives the crash reason (`Client.Crash`) and the new `halt` command (`Client.Halt`).
- `internal/apply`: the orchestration, as a `Manager` method, because it needs the apply slot, the service, the store and the healthcheck that the manager already owns. Holding the slot makes a parallel Apply get `ErrBusy` instead of racing for the service.

Rejected: a separate supervisor package with its own service handle. It would duplicate the healthcheck wiring and need its own lock against Apply.

### Honest rollback

`rollback` calls `awaitProcess` with the pid taken before the restart, then `health.Wait` with the Clash API settings of the restored config (`clashapi.Read` on the restored bytes, not the candidate's). A failure joins the restart error path: `rollback_failed`, the reason carries the crash reason, `lastSum` is reset as today. DNS and interception probes are not repeated: the rollback has nothing to roll back to, and the question is only whether the core runs. The same check goes into `Plane` rollback: its `reload` restarts the core too.

The wait ends early when procd knows the service, no instance runs and the crash reason carries the signature: the rollback has its own cycle timeout of two minutes, and in the incident the API wait alone used two minutes, so without the early exit nothing would be left for the recovery. The recovery gets its own timeout of the same length, not the remainder of the rollback's.

The `rollback_failed` path keeps today's state handling: the state file stays on disk. At the next daemon start the replay clears an `applying` transaction, because the disk already holds the previous config, and reruns the rollback of an `awaiting_confirm` one (restore, restart, healthcheck). With recovery at daemon start running after the replays, a router that rebooted into this state gets one more attempt without a user action.

### Recovery flow

1. A trigger sees a failed healthcheck or a failed service, reads the crash reason and matches the signature. No match: nothing else happens.
2. Read the running config, take the cache projection. `enabled` false or `store_subscriptions` false: the signature cannot come from this config; stop and report.
3. Stop the `sing-box` instance through the new init command and wait until procd reports no process.
4. Open the cache file with a lock timeout. Timeout: the file is untouched, start the service, report. Another open error: move the file aside (AC-93), start the service.
5. Delete the key of the tag. Absent key: start the service, report; do not search other buckets.
6. Start the service, wait for a new process and the Clash API. A new signature with a tag not dropped yet: repeat from step 3. The same tag or another failure: report.

Entry condition, the same for every trigger: procd knows the service, no instance is running, and the crash reason carries the signature. A service stopped by the user, a service procd does not know, a missing config or another crash reason ends the check at once without touching the slot, so the panel keeps working with sing-box down (AC-27).

Triggers:

- the rollback restart (AC-91 failure with the signature): recovery runs inside the rollback, under the same slot; success closes the transaction as `rolled_back` with the dropped tag in the reason;
- `POST /api/service/start` and `/restart`: after the action the handler watches the service for up to 15 seconds (`Manager.Watch`), the time the core takes to fail on its cache; on the entry condition it runs recovery, then answers with the state. A core that starts answers as today, a few seconds later;
- daemon start, after both replays: in a goroutine owned by `main`, cancelled by the root context. It polls the service without the apply slot and takes the slot only when the entry condition holds, so an Apply right after boot is not blocked by a healthy or stopped service.

### Moving a file aside

Renamed to `<file>.broken` in the same directory: one fixed name, replaced on every move, so repeated moves do not fill the flash. The name does not end in `.json`.

### Dependency

`go.etcd.io/bbolt` v1.5.0, the upstream of the fork's `github.com/sagernet/bbolt`. Measured on 2026-11-19, `linux/arm64`, `-trimpath -ldflags="-s -w"`: a program that opens a database and deletes a key is 1.97 MB against 1.31 MB without bbolt, the same for both modules; the only indirect module is `golang.org/x/sys`, which the daemon already requires at v0.41.0 and bbolt v1.5.0 raises to v0.45.0. Checked on the same day on darwin/arm64: a file with a top-level and a nested `rule_set` bucket written by `sagernet/bbolt`, a key deleted by `go.etcd.io/bbolt`, then reopened by `sagernet/bbolt`: the other keys are intact and `Tx.Check` reports no error. Not checked on linux: the fixture test runs on the CI runner, and the router is covered only by the device run of task 5.1. The decision, the rejected options and the condition for removal: [ADR-0088](../../../docs/adr/ADR-0088-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md).

### Fork pin test

`tools/schemagen/cachefile_test.go`, after the pattern of `provider_test.go`, three tests, one per fact:

- the link parser turns a VLESS xHTTP link without `extra.xPaddingBytes` into a zero range;
- a VLESS xHTTP outbound with `"x_padding_bytes": 0` fails to decode with `x_padding_bytes cannot be disabled`;
- a subscription entry the fork cannot parse, written with the fork's own `SaveSubscription`, fails the core start with `restore cached outbound provider`. The entry has an unknown outbound type, so this test does not depend on the other two.

`TestCacheFileFixture` keeps `apps/metaboxd/internal/cachefile/testdata/cache.db`, written by the fork, equal to what the pinned fork writes, compared by what the fork reads back; `make cache-fixture` regenerates it. The daemon tests and the bench test read that file.

## Risks / Trade-offs

- [Deleting a cache entry the user did not ask to delete] → only on the exact signature, only the key named by the core, logged with the tag; the next background update refills it.
- [A refilled entry is poisoned again: the subscription still returns the bad link] → the core runs until the next restart, and recovery repeats then. The fix belongs to the subscription source or the fork; recovery only keeps the router reachable.
- [Library divergence: the daemon's bbolt edits a file the fork's bbolt then rejects] → the fork deletes a file it cannot open; the fixture test from the fork's writer catches a format change on a fork bump.
- [The daemon holds the apply slot during a recovery] → only after the entry condition holds, and for at most the recovery timeout; Apply answers `ErrBusy` meanwhile.
- [The signature text changes in a fork release] → the pin test asserts the text; a change fails `make test-schemagen` before the bump ships.
- [The fallback probably fails the first start on `initial rule-set`] → kept by the owner's decision: the core is down in that case anyway, and the next start after the rule sets download comes up.

## Migration Plan

No data migration. The new init command ships in the same package as the daemon, so a daemon never calls a script without it. Rolling back the package returns the old rollback behaviour; a file moved aside stays as `<file>.broken` and can be removed by hand.

## Answered questions

The owner accepted the proposed option of every question on 2026-11-19:

- Attempts: one round per distinct provider tag, never the same tag twice. Every round deletes a key that exists, so the rounds end when the bucket has no key the core names; no separate counter.
- What the panel shows: a warning in the daemon log and, inside a rollback, the dropped provider in the transaction reason. A panel notice is issue #364.
- The wait in `POST /api/service/start` and `/restart`: the handler waits and answers after the recovery.
- Recovery on the Apply side: only in the rollback; `docs/Recovery.md` says that the user applies again.
- Dataplane rollback: AC-91 covers it.
- Entries of removed providers: not dropped.
- `cache_id`: only the bucket of the running config; an absent key stops the recovery.
- Fallback: kept.
- procd crash loop: no own accounting.
