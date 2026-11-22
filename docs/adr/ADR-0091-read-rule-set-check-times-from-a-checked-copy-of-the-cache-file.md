# ADR-0091. Read rule set check times from a checked copy of the cache file

- Status: Proposed
- Date: 2026-11-20
- Deciders: repository owner

## Context and problem statement

Issues #398 and #245. The rule sets screen cannot say when the core last checked a remote rule set or how large the downloaded file is: pull request #309 closed that part of #245 for own list files in `rule-sets/`, and remote sets still show a dash, because their data lives only in the core. Issue #398 asks what a service contains; the owner decided on 2026-11-20 that the panel describes a service by its source and does not read the list itself (see option 6).

Facts the decision depends on, checked in the fork pinned by `tools/schemagen/go.mod` (sing-box-extended 2.7.3) and in the daemon on 2026-11-20:

- The core downloads a remote set and saves it in its cache file (`experimental.cache_file`, a bbolt database, `cache.db` by default): bucket `rule_set`, key the set's tag, value `adapter.SavedBinary` (`experimental/cachefile/cache.go`, `adapter/experimental.go`). Its encoding is a version byte, the length of `Content` as a varint, `Content` as downloaded, `LastUpdated` as Unix seconds, `LastEtag` with its length, and from version 2 `URLHash` with its length (`MarshalBinary`). The length comes before the content, so the time, the size and the hash are read without copying the content. `URLHash` is the SHA-256 of the address (`route/rule/rule_set_remote.go`).
- The core sets `LastUpdated` both after a download and after a `304 Not Modified` answer (`rule_set_remote.go`, `fetch`). The value is the time of the last successful check, not of the last change of the list.
- The same `rule_set` bucket holds subscriptions and WARP and MASQUE endpoint data under their tags ([ADR-0088](./ADR-0088-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md)), so the bucket cannot be listed as "the rule sets". Subscriptions (`provider/remote/provider.go`) and those endpoints store their data as `SavedBinary` too, so a value under a tag decodes as a frame whatever wrote it.
- The core opens the file read-write with `bbolt.Open` and keeps it open while it runs, which holds an exclusive `flock`. bbolt opens even a read-only database under a shared `flock` (`ReadOnly` in bbolt `Options`), so a read-only open by the daemon blocks while the core runs, and a core start blocks while the daemon holds the file: the fork retries its open ten times with a one-second timeout, then fails the start.
- bbolt writes pages with `WriteAt` and writes the meta page last in a commit (`tx.go` of the fork's `sagernet/bbolt`). A page the committed tree uses is freed by the next write transaction and becomes reusable only when the one after it begins (`internal/freelist/shared.go`, `ReleasePendingPages`), so the tree of the current meta page stays whole until a newer meta page is written.
- The Clash API of the fork has no rule set data: `GET /providers/rules` returns an empty list and a provider returns `204` (`experimental/clashapi/ruleprovider.go`).
- `os.MkdirTemp("", …)` of the daemon lands in `/tmp`, which is `tmpfs`, that is RAM, on OpenWrt. A file there takes router memory outside the daemon's own resident memory.
- SRS stores domains as a succinct trie (`sing/common/domain`); the only exported way to list them is `Matcher.Dump`, which builds every string. Measured on 2026-11-20 on an Apple M4 Pro with a program that does what `sing-box rule-set decompile` does; the installed binary itself was not run. Peak memory and time:

  | Set                                    | SRS size | JSON size | Peak memory | Time   |
  | -------------------------------------- | -------- | --------- | ----------- | ------ |
  | `geosite-google.srs` (940 entries)     | 7.8 KB   | 24 KB     | 14 MB       | 2 ms   |
  | `geosite-cn.srs`                       | 58 KB    | 239 KB    | 20 MB       | 18 ms  |
  | `geosite-geolocation-!cn.srs`          | 169 KB   | 622 KB    | 28 MB       | 51 ms  |
  | `geoip-ru-blocked.srs` (88,585 ranges) | 201 KB   | 2.5 MB    | 64 MB       | 101 ms |
  | `geosite-ru-blocked.srs`               | 521 KB   | 2.0 MB    | 53 MB       | 142 ms |
  | `geosite-ru-blocked-all.srs` (1.6 M)   | 11.9 MB  | 49 MB     | 1,054 MB    | 3.8 s  |

  Address sets cost about three times more per byte than domain sets. A router is slower and smaller than the machine these were measured on.

- Measured on the same day for `linux/arm64` with `-trimpath -ldflags="-s -w"`: a program that imports `common/srs` is 5.44 MB against 1.57 MB without it, and pulls 238 packages. Building it needs the `replace` block of `tools/schemagen/go.mod`.
- The daemon module requires the MCP Go SDK and `go.etcd.io/bbolt`, the latter imported only by `internal/cachefile` (ADR-0088); a new dependency is a separate decision ([`apps/metaboxd/AGENTS.md`](../../apps/metaboxd/AGENTS.md)).
- The daemon's resource budget is a steady-state resident memory of at most 64 MB with no panel open (`openspec/specs/non-functional`, NFR-4).

In scope: how the daemon gets the check time, size and address match of a cached remote set. Out of scope: the panel layout (the change [`rule-set-contents`](../../openspec/changes/rule-set-contents/proposal.md)), `local` sets outside `rule-sets/`, searching a domain in a set.

## Decision drivers

- The answer describes the copy the core uses, not a fresh download.
- The core's start and work are never delayed or put at risk.
- No new Go dependency in the daemon unless there is no way around it.
- Memory and time stay bounded on a router, and the daemon keeps nothing large between requests.
- The reading can be checked by tests against the fork, the way ADR-0088 checks the cache file layout.

## Considered options

### Where the data comes from

1. **Copy the cache file while the core runs and read the copy with the bbolt the daemon already has.** No lock is taken on the live file, so the core is unaffected. A copy can be torn by a commit made during it; it is detected by comparing the two meta pages of the live file before and after the copy and copying again when they differ. A copy that passes holds the last committed tree whole, since its pages are not reused before the next commit; this follows from the bbolt source above and has not been exercised against a core writing the file yet. Cost: a temporary file as large as the cache file in RAM for the time of one read. **Chosen.**
2. **Open the live file with bbolt read-only.** Takes a shared lock: the daemon waits for the core, and a core restart during the read fails after ten seconds. **Rejected.**
3. **Stop the core, read, start it again.** The internet goes down for every read. **Rejected.**
4. **The daemon downloads the address itself.** Not the copy the core loaded; costs traffic on every read; the core may fetch through an outbound (`download_detour`) the daemon cannot use. **Rejected.**
5. **Ask the core over the Clash API.** The fork returns nothing for rule sets. **Rejected.** Adding it means patching the fork.

### Whether to read what a set contains

6. **Read the list itself: entry counts and sample domains**, by any of three means: unpacking with the installed binary (`sing-box rule-set decompile`) for sets up to a size limit; importing the fork's `common/srs` into the daemon; an own reader of the SRS trie of about 200 lines. **Rejected by the owner on 2026-11-20.** Reasons: it is the same kind of work as the product non-goal of downloading and parsing `geosite.dat`/`geoip.dat` on the device (`docs/PRD.md`, section 8); listing the domains of a large set costs about 100 times the file size for domains and 300 times for address ranges (the table above), so a router either refuses the largest categories or spends hundreds of megabytes; the import costs 3.9 MB of binary and a second fork pin; the own reader is self-written code that follows a format the project does not own. A service is described by its source and its use instead, which the panel already knows.
7. **Keep the current approach.** Remote sets stay a dash on the rule sets screen. **Rejected**: it is the problem of #245.

## Decision outcome

- `internal/cachefile` gains a read path. It never opens the live cache file with bbolt and never takes its lock. It copies the file into a temporary directory made with `os.MkdirTemp`, as `internal/apply` does for a candidate config, compares the two meta pages of the live file with those of the copy, copies again on a difference up to three times, and opens only the copy, read-only. The copy is removed after the read, on every path.
- The read path looks up given tags in the `rule_set` bucket, at the top level or under `0x00` + `cache_id`, and never lists the bucket. It decodes the `SavedBinary` frame without copying `Content`: the content length, the first bytes of the content, `LastUpdated` and `URLHash`. A value whose frame does not decode, or whose content, after a byte order mark and whitespace, starts neither with the SRS magic `SRS` nor with `{`, reads as unreadable: a subscription in a share-link or base64 format under the same tag lands there. A subscription in JSON under the tag of a rule set cannot be told apart and reports its own time and size; in that case the fork overwrites one with the other (ADR-0088). A version-1 value has no `URLHash` and counts as the same address, as the core treats it.
- The daemon keeps only the small result per live file size and modification time and per the remote entries asked for; it copies again only when the live file or those entries change, one copy at a time. A cache file above 64 MiB is not copied; the limit is a value the owner can lower.
- Which sets to report and which cache file to read come from the applied config: the targeted decode `clashapi.ReadCacheFile` already does for `experimental.cache_file`, extended to the tag and address of `remote` entries of `route.rule_set`. The daemon does not parse or rewrite the config as a whole.
- The daemon never runs the core binary for this and never reads the list inside `Content`.
- No new Go dependency in the daemon `go.mod`.

## Consequences

### Positive

- Remote sets get a check time, a size and an "other address" mark from the copy the core actually loaded.
- The core's lock is never touched, so the reading cannot delay a start or an Apply.
- Memory is bounded by the cache file size for the time of one read; nothing grows with the number of entries in a set.

### Negative

- `internal/cachefile` reads a file the core owns while the core writes it. ADR-0088 allowed only an edit with the core stopped; the read path is a second, separate use of the same package.
- Each read after a change of the live file puts a full copy of it in RAM on `tmpfs`: about 12 MB with the largest catalog set, up to the 64 MiB limit. It is outside the daemon's resident memory and outside the NFR-4 budget, which is measured with no panel open, but it is router memory all the same. The daemon's own resident memory grows only by the bbolt pages of the copy it touches and returns when the copy is closed.
- The daemon depends on the `SavedBinary` encoding of the fork, a format it does not own.
- The UI must say "checked", not "updated": the core does not record when the list itself changed.
- The panel cannot say how many sites a service holds or which ones; #398 is closed by a description of the source instead.

### Neutral or deferred

- `local` sets with a path outside `rule-sets/` and inline sets are not read by this decision.
- `sing-box rule-set match` for "is this domain in the set" stays as [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md) decided; this decision does not implement it.

## Risks and mitigations

| Risk                                                                | Likelihood and impact                              | Mitigation                                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A torn copy passes the meta check                                   | low; a wrong time or size for one read             | the meta check, the length checks of the frame decoder, the fault recovery of the package  |
| The fork moves rule sets out of `rule_set` or changes `SavedBinary` | medium on a fork bump; the read reports unreadable | the fork pin test writes a set through `SaveRuleSet` and the daemon tests read the fixture |
| RAM on a small router during the copy                               | low on the target hardware; medium below 256 MB    | the 64 MiB limit, one copy at a time, a new copy only after the live file changes          |

## Compatibility, migration and rollback

Not applicable for data: the daemon writes nothing to the cache file and the config. Rolling back removes the endpoint; the panel falls back to the dash it shows today.

## Validation

- `make test-schemagen`: the fork pin test in `tools/schemagen/cachefile_test.go` writes a binary and a JSON source set through the fork's `SaveRuleSet` into the fixture; a core started with a remote set whose address is a local test server answering `304 Not Modified` moves the entry's `LastUpdated`, the way the existing pin tests start a core with `box.New`.
- `make test`: `apps/metaboxd/internal/cachefile` tests read the fixture, decode the frame without the content, reject a copy whose meta pages changed, and never open the live file with a lock (a test holds the exclusive lock on the source and the read still succeeds).
- `make lint`, and `apps/metaboxd/go.mod` requires the MCP SDK and `go.etcd.io/bbolt` only.
- The `integration` job of `.github/workflows/ci.yml`: on the bench, a remote set reports its check time and size while the service runs, and a service restart during a read is not delayed.
- Files governed: `apps/metaboxd/internal/cachefile/`, `apps/metaboxd/internal/clashapi/cachefile.go`, the rule set handler in `apps/metaboxd/internal/httpapi/`, `tools/schemagen/cachefile_test.go`.

## Links

- Issues #398, #245, #395; pull request #309.
- [`rule-set-contents`](../../openspec/changes/rule-set-contents/proposal.md): the change this decision serves.
- [ADR-0088](./ADR-0088-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md): the cache file package and its fixture test; this decision adds a read path next to its edit.
- [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md): whether a domain matches a rule set is asked of the installed binary.
- [ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md): the fork is pinned only in `tools/schemagen`.
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): the config is bytes for the daemon; the targeted read here does not change it.
