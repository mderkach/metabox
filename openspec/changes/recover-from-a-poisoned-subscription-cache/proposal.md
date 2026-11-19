## Why

Issue #338: a remote subscription stored in the sing-box cache file (`cache.db`, kept with `experimental.cache_file.store_subscriptions`) can hold an outbound that the fork wrote itself but refuses to read back. A VLESS xHTTP link without `extra.xPaddingBytes` is parsed into `"x_padding_bytes": 0`; the running node works, but on the next start the option check rejects the zero, the provider fails to restore its cache, and the whole core exits with `restore cached outbound provider`. procd respawns it into a crash loop. The Apply rollback then restores the previous config, restarts the service without a health check and reports `previous config restored`, while the core stays down: the poisoned entry is not part of what Apply backs up. The router had no working core until the provider was removed over SSH.

This breaks the promise of AC-14 (a config that breaks connectivity is returned automatically, without SSH), proposed in [`rollback-of-a-breaking-config`](../rollback-of-a-breaking-config/proposal.md). The crash is not tied to Apply: the background subscription update writes the entry while the core runs, and any later start fails, including a router reboot. The pinned 2.7.3 has no fix, the fork's main branch had none when the issue was researched, and the owner decided not to patch the fork.

## What Changes

- **Honest rollback.** After the rollback restart (a failed step, an expired confirmation window, a replay at daemon start) the daemon waits for a new process and the Clash API of the restored config, as the Apply healthcheck does. If the core does not come up, the transaction closes as `rollback_failed` with the crash reason, not as `rolled_back`.
- **Recovery from a poisoned subscription entry.** When the core fails with the signature `start provider/remote[<tag>]: restore cached outbound provider`, the daemon stops only the sing-box process (interception stays), deletes the entry of that provider from `cache.db` with the `cache_id` and the file path taken from the config, starts the service and waits for the healthcheck. Triggers: the rollback restart, a start or restart of the service from the panel, the daemon start. Other subscriptions, remote rule sets and the rest of the cache stay.
- **Fallback for an unreadable cache file.** If `cache.db` does not open as a bbolt database for a reason other than a held lock, the daemon moves the file aside whole and starts the service.
- **Fork pin test.** `tools/schemagen` runs the pinned fork and pins two facts separately: a cached outbound with `x_padding_bytes: 0` fails the option check, and a cached subscription entry that fails to parse fails the core start. A fork bump that fixes either fails the matching test and points at what the fork fixed.
- **New daemon dependency** `go.etcd.io/bbolt` to read and edit `cache.db`, recorded in [ADR-0086](../../../docs/adr/ADR-0086-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md) as Proposed, accepted together with this proposal.
- A new init script command of `metabox-singbox` that stops the sing-box instance without removing the dataplane.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply`: AC-91, the rollback reports a core that did not come up.
- `service`: AC-92, the daemon drops a cached subscription entry that crashes the core; AC-93, an unreadable cache file is moved aside.

## Impact

- `apps/metaboxd/internal/apply` (rollback, replay, recovery orchestration), `internal/singbox` (the new init command, the crash signature), `internal/clashapi` (a bounded projection of `experimental.cache_file`), a new package for the cache file, `internal/httpapi` (service start and restart), `main.go` (the check at daemon start).
- `apps/metaboxd/package/etc/init.d/metabox-singbox`: the new command.
- `apps/metaboxd/go.mod`, `go.sum`: `go.etcd.io/bbolt` and nothing new besides it (`golang.org/x/sys` is already there).
- `tools/schemagen`: the fork pin test.
- `apps/metaboxd/docs/guides/Architecture&Style.md` (projection table, dependency rule), `DeviceIO.md` (rollback health, recovery), `docs/Recovery.md` and `docs/Recovery.ru.md`, `docs/Verification.md`.
- The panel: no new screen. `rollback_failed` is already shown with its reason; what it shows after a recovery is an open question.

## Out of scope

- Checking a subscription in the panel when it is added, and `store_subscriptions: false`: rejected by the owner.
- A fix in the fork (defaulting `x_padding_bytes` like Xray, a non-fatal cache restore with a refetch, skipping one bad node): the owner decided not to write to the fork. The pin test and the ADR record when this change is narrowed.
- The device run of AC-14 and its Verification rows: [`rollback-of-a-breaking-config`](../rollback-of-a-breaking-config/proposal.md).
- A background watcher of the service state: the daemon does not poll without a consumer. A crash loop that starts outside the triggers (a restart over SSH, a respawn after an unrelated crash) is recovered at the next trigger, at the latest at the next daemon start.
- Showing the update time and size of remote rule sets, which are also in `cache.db` (issue #245): a possible next user of the same package, not part of this change.

## Open questions

- **Attempts.** How many recovery rounds before giving up? A second poisoned provider shows up only after the first entry is dropped. Proposed: one round per distinct provider tag, at most as many rounds as the cache has subscription entries, and never the same tag twice.
- **What the panel shows.** Recovery changes the device without the user asking. Proposed for this change: a warning line in the daemon log and, when recovery ran inside a rollback, the dropped tag in the transaction reason text. A dedicated panel notice is a follow-up issue.
- **Recovery on the Apply side.** If the poisoned entry was written before an Apply, the new config fails its healthcheck for a reason it did not cause, the rollback recovers, and the user has to apply again. Proposed: keep recovery on the rollback side only and say so in `docs/Recovery.md`; recovering inside the forward step would let an Apply pass with a cache edit the user did not see.
- **Dataplane rollback.** `Plane` rollback (interception settings, the Devices screen) restarts the core with `reload` and logs `previous dataplane model restored` without a healthcheck: the same false report. Proposed: AC-91 covers it too, in the same commit topic.
- **Entries of removed providers.** The issue also asks to drop cache entries of providers that are no longer in the config: a provider added again with the same tag brings the crash back. Proposed: no. Recovery handles the crash when it happens; reading `providers[]` widens the config projection for a rare case.
- **`cache_id`.** With `cache_id` set the entry lives in a nested bucket named `0x00` + `cache_id`. Proposed: follow the config the service runs; if the entry is not in that bucket, recovery stops and reports, it does not search other buckets.
- **Fallback reach.** The fork already deletes a cache file it cannot open (`ErrInvalid`, `ErrChecksum`, `ErrVersionMismatch`, a failed database check), and the crash signature means the core did open the file. The fallback therefore runs only when the daemon's bbolt cannot read a file the fork's bbolt can, and moving the whole file away probably fails the first start on `initial rule-set` when rule sets download through subscription nodes. Keep it as decided, or drop it as unreachable?
- **procd crash loop.** With the default `respawn` (5 retries within an hour) procd gives up and the instance stays down. Recovery starts the service again, which resets the count. Proposed: no own accounting of procd retries.
