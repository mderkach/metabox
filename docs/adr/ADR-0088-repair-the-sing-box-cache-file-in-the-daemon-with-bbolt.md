# ADR-0088. Repair the sing-box cache file in the daemon with bbolt

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner

## Context and problem statement

Issue #338. The sing-box fork keeps remote subscriptions in its cache file (`experimental.cache_file`, a bbolt database, `cache.db` by default) when `store_subscriptions` is on. The fork can write an entry it later refuses to read: a VLESS xHTTP link without `extra.xPaddingBytes` becomes `"x_padding_bytes": 0`, and on the next start `option/v2ray_transport.go` rejects the zero (`x_padding_bytes cannot be disabled`). `provider/remote/provider.go` treats a cached entry that fails to parse as fatal (`restore cached outbound provider`), with no fallback to a download, and the core does not start. Any restart hits it, a router reboot included, and the entry is written by the background update before anyone applies anything. The behaviour is the same in the fork 2.7.3 pinned by `tools/schemagen/go.mod` and in 2.7.2 on the router; the fork's main branch had no fix when the issue was researched in November 2026; the issue was not reproduced on the device beyond the original incident.

The owner decided to solve it without writing to the fork and without turning `store_subscriptions` off. The change [`recover-from-a-poisoned-subscription-cache`](../../openspec/changes/recover-from-a-poisoned-subscription-cache/proposal.md) has the daemon drop the one entry the core names in its crash and start the core again. That needs the daemon to edit a bbolt file.

Facts the decision depends on:

- The daemon module requires only the MCP Go SDK ([ADR-0055](./ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md)); a new dependency is a separate decision ([`../../apps/metaboxd/AGENTS.md`](../../apps/metaboxd/AGENTS.md)).
- The fork uses `github.com/sagernet/bbolt`, a fork of `go.etcd.io/bbolt` without tagged releases: 2.7.3 pins `v0.0.0-20260915102804-500ee1e84832`, 2.7.2 pins `v0.0.0-20260823094646-e24805439c9c`.
- Measured on 2026-11-19 for `linux/arm64` with `-trimpath -ldflags="-s -w"`: a program that opens a database and deletes a key is 1.97 MB with `go.etcd.io/bbolt` v1.5.0 and the same with `sagernet/bbolt`, against 1.31 MB for the same program without bbolt. The only indirect module of either is `golang.org/x/sys`, which the daemon already requires at v0.41.0; bbolt v1.5.0 raises it to v0.45.0.
- Checked on the same day on darwin/arm64: a file with a top-level and a nested `rule_set` bucket written by `sagernet/bbolt`, a key deleted by `go.etcd.io/bbolt` and the file reopened by `sagernet/bbolt` keeps the other keys, and `Tx.Check` finds no error. Not checked on the router yet.
- The fork's CLI has no command that edits the cache file (`cmd/sing-box/` in the fork sources).
- The core holds the file lock while it runs, so the file is edited only with the `sing-box` process stopped.
- The fork deletes a cache file it cannot open (`ErrInvalid`, `ErrChecksum`, `ErrVersionMismatch`, a failed database check) in `experimental/cachefile/cache.go`.
- Without the cache, remote rule sets download at start and the first failure is fatal; where they download through subscription nodes, a start without any cache probably fails.

In scope: how the daemon edits the cache file. Out of scope: when it does so (the change's design), checking subscriptions in the panel, patching the fork.

## Decision drivers

- The core comes back without SSH and keeps the rest of the cache, remote rule sets in particular.
- No change to the fork.
- The smallest dependency footprint the daemon can have for the job.
- The file the daemon writes stays readable by the fork.
- The decision can be removed when the fork fixes the cause, and the project learns when that happens.

## Considered options

1. **`go.etcd.io/bbolt` in the daemon, one package imports it.** Deletes the one entry, keeps everything else. Upstream with tagged releases; the file format is the one `sagernet/bbolt` reads. Cost: 0.66 MB of binary, a minor version bump of `golang.org/x/sys`, a second external module to follow, and a duty to check that the formats of the two libraries stay compatible. **Chosen.**
2. **`github.com/sagernet/bbolt` in the daemon.** The same library the core uses, so no format question. Drawbacks: no releases, only pseudo-versions; the router and the pinned fork already use two different commits, so matching the core exactly would mean following the fork's pin. **Rejected**: the format compatibility it buys is checked by a test in option 1 instead.
3. **Move the whole cache file aside, no library.** A rename needs nothing. Drawbacks: drops every subscription, the remote rule sets and the DNS caches; the first start then downloads rule sets and probably fails where they go through subscription nodes. **Rejected** as the main path; kept as the fallback for a file the daemon cannot open (AC-93 in the change).
4. **A `sing-box` subcommand.** The fork has none that edits the cache, and adding one is writing to the fork. **Rejected.**
5. **Keep the current approach.** The core stays down until someone removes the provider over SSH, and the Apply rollback cannot help. **Rejected**: it is the problem.

## Decision outcome

- The daemon requires `go.etcd.io/bbolt`, pinned exactly in `apps/metaboxd/go.mod` and `go.sum`. One package under `apps/metaboxd/internal/` imports it; no other package does.
- That package opens the cache file only with the `sing-box` process stopped and with a lock timeout. A timeout leaves the file untouched.
- It deletes one key in the `rule_set` bucket, at the top level or under the bucket `0x00` + `cache_id`, and moves the whole file aside when bbolt refuses it for its content. It does not create buckets, write values or read other buckets.
- The key is the bare tag. The fork keeps subscriptions, remote rule sets and the WARP and MASQUE endpoint data under it, so a remote rule set or an endpoint with the same tag as the subscription loses its entry too. With two of them under one tag the fork already overwrites one entry with the other; checking tags for uniqueness is left to a separate change.
- The format is checked against the fork: a fixture cache file is written by the fork's own code in `tools/schemagen` and read by the daemon tests.

### When the mechanism is removed or narrowed

- The fork rejects a cached entry without failing the start (skips the provider, or refetches as remote rule sets already do): the recovery is removed, and the dependency with it unless another user holds it.
- The fork defaults `x_padding_bytes` like Xray-core (`100-1000` when the value is zero or absent, a guard on the empty range): the known cause is gone; the recovery stays only while other unreadable entries are possible and is reviewed then.
- The signature text changes: the recovery stops matching and must follow it before the bump ships.

The fork pin test in `tools/schemagen` asserts both behaviours separately, so a bump through `fork-release-watch` that changes either fails `make test-schemagen` and sends this decision back for review.

### Possible next user

Issue #245 asks for the update time and size of remote rule sets, which the fork keeps in the same `rule_set` bucket. Reading them would need the same package, read-only and with the file open while the core runs, which bbolt does not allow next to the core's lock without a copy. Not decided here.

## Consequences

### Positive

- A poisoned subscription entry no longer leaves the router without a core until someone uses SSH.
- Remote rule sets and other subscriptions survive the repair, except an entry under the same tag as the dropped subscription: the fork keeps them under one key.

### Negative

- The daemon binary grows by about 0.66 MB, and a second external module joins the daemon's update duty.
- The daemon writes into a file another program owns. A future change of the fork's layout (bucket name, key, `cache_id` encoding) silently stops the recovery until the pin test catches it.
- Two bbolt implementations write the same file; their formats can drift.

### Neutral or deferred

- Detecting a bad node before the core restarts is not decided here.

## Risks and mitigations

| Risk                                              | Likelihood and impact                             | Mitigation                                                                             |
| ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| The two libraries' formats drift                  | low; the core resets a file it cannot open        | fixture written by the fork, read by the daemon tests                                  |
| The daemon edits the file while the core holds it | low; bbolt refuses without the lock               | the process is stopped first, the open has a lock timeout, a timeout changes nothing   |
| The fork moves subscriptions out of `rule_set`    | medium on a fork bump; the recovery stops working | the pin test writes through the fork's `SaveSubscription` and the daemon reads it back |

## Compatibility, migration and rollback

No migration: the daemon edits the file only on the crash signature. Rolling back the package drops the recovery; a file moved aside by the fallback stays next to the cache under a fixed name and can be deleted by hand.

## Validation

- `make test-schemagen`: the fork pin tests in `tools/schemagen/cachefile_test.go` pass on the pinned fork.
- `make test`: the cache file package tests against the fixture; the recovery tests in `apps/metaboxd/internal/apply`.
- `make lint`, and `apps/metaboxd/go.mod` requires the MCP SDK and `go.etcd.io/bbolt` only.
- The `integration` job of `.github/workflows/ci.yml`: the bench service with a poisoned entry comes back.
- Files governed: `apps/metaboxd/go.mod`, the cache file package under `apps/metaboxd/internal/`, `tools/schemagen/cachefile_test.go`.

## Links

- Issue #338, issue #245.
- [`recover-from-a-poisoned-subscription-cache`](../../openspec/changes/recover-from-a-poisoned-subscription-cache/proposal.md), [`rollback-of-a-breaking-config`](../../openspec/changes/rollback-of-a-breaking-config/proposal.md) (AC-14).
- [ADR-0055](./ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md): the first daemon dependency.
- [ADR-0079](./ADR-0079-warn-about-a-shrunk-subscription-in-the-panel-and-leave-the-core-update-as-is.md): the fork pin test pattern.
- [`tools/schemagen/provider_test.go`](../../tools/schemagen/provider_test.go).
