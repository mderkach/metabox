## Why

Issue #338: a remote subscription stored in the sing-box cache file (`cache.db`, kept with `experimental.cache_file.store_subscriptions`) can hold an outbound that the fork wrote itself but refuses to read back. A VLESS xHTTP link without `extra.xPaddingBytes` is parsed into `"x_padding_bytes": 0`; the running node works, but on the next start the option check rejects the zero, the provider fails to restore its cache, and the whole core exits with `restore cached outbound provider`. procd respawns it into a crash loop. The Apply rollback then restores the previous config, restarts the service without a health check and reports `previous config restored`, while the core stays down: the poisoned entry is not part of what Apply backs up. The router had no working core until the provider was removed over SSH.

This breaks the promise of AC-14 (a config that breaks connectivity is returned automatically, without SSH), proposed in [`rollback-of-a-breaking-config`](../rollback-of-a-breaking-config/proposal.md). The crash is not tied to Apply: the background subscription update writes the entry while the core runs, and any later start fails, including a router reboot. The pinned 2.7.3 has no fix, the fork's main branch had none when the issue was researched, and the owner decided not to patch the fork.

## What Changes

- **Honest rollback.** After the rollback restart (a failed step, an expired confirmation window, a replay at daemon start) the daemon waits for a new process and the Clash API of the restored config, as the Apply healthcheck does. If the core does not come up, the transaction closes as `rollback_failed` with the crash reason, not as `rolled_back`.
- **Recovery from a poisoned subscription entry.** When the core fails with the signature `start provider/remote[<tag>]: restore cached outbound provider`, the daemon stops only the sing-box process (interception stays), deletes the entry of that provider from `cache.db` with the `cache_id` and the file path taken from the config, starts the service and waits for the healthcheck. Triggers: the rollback restart, a start or restart of the service from the panel, the daemon start. Other subscriptions, remote rule sets and the rest of the cache stay.
- **Fallback for an unreadable cache file.** If `cache.db` does not open as a bbolt database for a reason other than a held lock, the daemon moves the file aside whole and starts the service.
- **Fork pin test.** `tools/schemagen` runs the pinned fork and pins two facts separately: a cached outbound with `x_padding_bytes: 0` fails the option check, and a cached subscription entry that fails to parse fails the core start. A fork bump that fixes either fails the matching test and points at what the fork fixed.
- **New daemon dependency** `go.etcd.io/bbolt` to read and edit `cache.db`, recorded in [ADR-0086](../../../docs/adr/ADR-0086-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md).
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
- The panel: no new screen. `rollback_failed` is already shown with its reason, and a rollback that recovered names the dropped subscription in the same reason text. A dedicated panel notice is issue #364.

## Out of scope

- Checking a subscription in the panel when it is added, and `store_subscriptions: false`: rejected by the owner.
- A fix in the fork (defaulting `x_padding_bytes` like Xray, a non-fatal cache restore with a refetch, skipping one bad node): the owner decided not to write to the fork. The pin test and the ADR record when this change is narrowed.
- The device run of AC-14 and its Verification rows: [`rollback-of-a-breaking-config`](../rollback-of-a-breaking-config/proposal.md).
- A background watcher of the service state: the daemon does not poll without a consumer. A crash loop that starts outside the triggers (a restart over SSH, a respawn after an unrelated crash) is recovered at the next trigger, at the latest at the next daemon start.
- Showing the update time and size of remote rule sets, which are also in `cache.db` (issue #245): a possible next user of the same package, not part of this change.

## Open questions

None. The owner answered every question of the first draft with the proposed option on 2026-11-19; the answers are recorded in design.md, "Answered questions".
