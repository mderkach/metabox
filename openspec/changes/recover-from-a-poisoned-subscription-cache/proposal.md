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
- `apps/metaboxd/go.mod`, `go.sum`: `go.etcd.io/bbolt`; the indirect `golang.org/x/sys`, already required, goes from v0.41.0 to v0.45.0.
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

Each item: what is open, the options, their cost, the proposed answer.

- **Attempts.** A second poisoned subscription shows up only after the first entry is dropped. Options: (a) one round per distinct provider tag, never the same tag twice; (b) a single round. Cost: (a) can take several restarts of the core in a row; (b) leaves the core down when two subscriptions are poisoned. Proposed: (a), with the number of subscription entries in the cache as the ceiling.
- **What the panel shows after a recovery.** The daemon changes the device without the user asking. Options: (a) a warning in the daemon log and, inside a rollback, the dropped provider in the transaction reason; (b) a dedicated panel notice. Cost: (a) the user sees nothing when recovery runs at boot or after a restart from the panel; (b) a new contract field, texts in two languages and a design pass. Proposed: (a) in this change, (b) as a follow-up issue.
- **The wait in `POST /api/service/start` and `/restart`.** To see the crash the handler has to wait a few seconds after the init script returns. Options: (a) wait in the handler and answer after the recovery; (b) answer at once and recover in the background. Cost: (a) the panel button answers a few seconds later even for a healthy core; (b) a goroutine with an owner and a state the panel has to poll. Proposed: (a), with a short poll that ends as soon as the core answers.
- **Recovery on the Apply side.** If the entry was poisoned before an Apply, the new config fails its healthcheck for a reason it did not cause, the rollback recovers, and the user has to apply again. Options: (a) recover only in the rollback; (b) also recover inside the forward step and let the Apply continue. Cost: (a) one extra Apply by the user; (b) an Apply passes with a cache edit the user did not see, and the healthcheck result means less. Proposed: (a), and `docs/Recovery.md` says so.
- **Dataplane rollback.** `Plane` rollback (interception settings, the Devices screen) restarts the core with `reload` and logs `previous dataplane model restored` without a healthcheck: the same false report. Options: (a) AC-91 covers it; (b) leave it for another change. Cost: (a) more tests in this change; (b) the false report stays for interception changes. Proposed: (a).
- **Entries of removed providers.** The issue also asks to drop cache entries of providers no longer in the config: a provider added again under the same tag brings the crash back. Options: (a) no; (b) drop them on every Apply. Cost: (a) the crash can come back, and recovery handles it then; (b) the daemon reads `providers[]` and edits the cache on every Apply, with the core stopped. Proposed: (a).
- **`cache_id`.** With `cache_id` set the entry lives in a nested bucket named `0x00` + `cache_id`. Options: (a) only the bucket of the running config; (b) search every bucket for the tag. Cost: (a) none known, the core reads only its own bucket; (b) may delete an entry another config needs. Proposed: (a); an absent key stops the recovery with a report.
- **Fallback reach.** The fork already deletes a cache file it cannot open, and the crash signature means the core did open the file, so the fallback runs only when the daemon's bbolt cannot read a file the fork's can. Moving the whole file probably fails the first start on `initial rule-set` when rule sets download through subscription nodes. Options: (a) keep it as decided; (b) drop it. Cost: (a) a small package path and its tests for a case not seen yet; (b) a format drift between the two libraries leaves the core down until SSH. Proposed: (a), the owner decided it, and it is cheap.
- **procd crash loop.** With the default `respawn` (5 retries within an hour, from memory of the procd defaults, not checked on the router) procd gives up and the instance stays down. Options: (a) no own accounting; (b) read procd's retry count. Cost: (a) none, a recovery starts the service again and resets the count; (b) one more ubus field to parse. Proposed: (a).
