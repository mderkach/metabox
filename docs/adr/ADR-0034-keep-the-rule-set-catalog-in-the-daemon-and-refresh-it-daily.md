# ADR-0034. Keep the rule set catalog in the daemon and check it against the providers once a day

- Status: Accepted
- Date: 2026-09-25
- Deciders: repository owner

## Context and problem statement

AC-7 requires a catalog of ready rule sets with a provider choice and search by category that opens without network access. Before this decision the category list was a snapshot built with the panel and shipped in its bundle. The snapshot drifts from what providers publish: Runet Freedom and v2fly add and remove categories, and the panel learned about it only with a new build. A category the provider no longer has builds a URL to a nonexistent file, and sing-box does not start with such a rule set.

Constraints set earlier:

- Before this decision the daemon did not go to the internet: its HTTP requests went only to the local Clash API.
- The [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md) rule: there are no timer-based background polls without a consumer, an exception is added only with a cost analysis.
- The router has no real-time clock ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)): after power-on it starts from the epoch.
- The daemon's state directory is owned by `config.Store` — one owner per resource.

Facts about the external source, measured on 2026-09-25:

- The provider's file list is returned by the GitHub REST API (`git/trees`): 67 to 578 KB per list, about 75 KB compressed.
- Without a token the limit is 60 requests per hour per address, and a conditional ETag request also counts against it, although the `304` response comes without a body.
- jsDelivr does not fit as a fallback source of the list: for Runet Freedom it answers `403`, the package is larger than 50 MB.
- From the BPI-R4 Pro `api.github.com` answers in 0.6 s.

In scope: who keeps the catalog, how and when it is checked against the providers, what the panel sees without a network. Out of scope: the user's custom lists ([ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md)).

## Decision drivers

- The list matches what the provider publishes, with a lag of no more than a day.
- The catalog opens without internet (AC-7).
- One home for the provider table: URLs and templates are not duplicated between Go and TypeScript.
- The load on the router and on the GitHub limit is proportionate to the benefit.
- No new dependency appears in the daemon.

## Considered options

1. **Keep the snapshot in the panel bundle.** The simplest path: no network is needed at all. But the list is exactly as fresh as the build, and drift from the provider is the normal state. **Rejected** by the first driver.
2. **The browser checks against GitHub itself.** The daemon does not change, TanStack Query holds the cache. The cache lives in the tab, and each visit spends four requests of the limit. A browser without internet sees only the built-in snapshot, and the provider table stays in the frontend. **Rejected.**
3. **The daemon checks lazily, on a panel request.** A cache older than a day is returned at once and refreshed in the background. Fits the DeviceIO rule without an exception. But the first visit after idle sees an outdated list. **Rejected** by the owner: the list must be fresh for any visit.
4. **The daemon owns the catalog and checks it on a timer.** **Chosen.**

## Decision outcome

The catalog of ready rule sets is owned by the daemon, package `internal/ruleset`.

- **The provider table** lives only in Go: the provider, its site lists (`geosite`) and address lists (`geoip`), the selection for an empty field and the branch directory on GitHub. GitHub and jsDelivr mirror URLs are derived from the branch directory, not written separately.
- **The snapshot** `internal/ruleset/snapshot.json` is embedded in the binary with `go:embed` and built by `make rule-set-snapshot` (`cmd/rulesetsnap`). The daemon starts with it until it has checked by itself, so the catalog opens without internet too.
- **The check** runs on a timer for the whole daemon lifetime, whether the panel is open or not: at once if the list is the snapshot or older than the interval, then once per interval. The interval is set by the `-rule-set-refresh` flag: a day by default, `0` disables the check, an interval shorter than the retry pause is rejected at start. A failed check is retried in an hour, not in a day: at router start the network and the clock come up later than the daemon.
- **The request** to `api.github.com/repos/…/git/trees/…` is conditional, by the ETag of the last check. A `304` response keeps the list and updates the check date. A truncated tree and a tree without rule set files count as a failure: the previous list stays.
- **The cache** of the checked list is written by `config.Store` to `<state-dir>/rule-sets.json` with an atomic write and permissions 0600. An unchecked snapshot does not enter the cache, and content whose fingerprint matches what is written is not rewritten: a check that failed entirely is retried every hour.
- **The panel** gets the catalog from the `GET /api/rule-sets/catalog` endpoint. A catalog failure does not hide the rule set list: without the catalog it is visible and editable, and the form keeps its URL. The response schema is generated by `cmd/contractgen`. The panel keeps the catalog in TanStack Query for a day and keeps no copy of its own. Each list in the response has a source (`snapshot` or `provider`) and a date, and the form shows them under the category field.

Non-goals: a GitHub token, parsing `geosite.dat`, checking that the file exists on every category input.

### Scope and boundaries

`apps/metaboxd/internal/ruleset`, `internal/config` (cache), `internal/httpapi` (endpoint), `cmd/rulesetsnap`, `apps/web/src/entities/RuleSet`, the form `features/RuleSet/RuleSetAdd`.

## Consequences

### Positive

- The list lags the provider by no more than a day, and the panel shows this with a date.
- The provider table is written in one place, the frontend does not duplicate it.
- The catalog opens without internet: the snapshot ships in the daemon binary.

### Negative

- The daemon goes to the internet for the first time. This is a new failure surface and the third exception to the rule "no background polls without a consumer". The cost is four requests to GitHub once a day and parsing responses of up to 600 KB during the check.
- If GitHub is unreachable from the device, the catalog freezes on the cache or the snapshot, and a warning goes to the log every hour.
- The tokenless limit is counted per address: behind a shared NAT someone else may use it up, and the check will be postponed.
- The snapshot has to be rebuilt by hand before a release, otherwise a new installation starts with an old list.

### Neutral or deferred

- A GitHub token as a flag — if the limit becomes a problem in practice.
- Setting the interval through the `metabox` UCI section — for now only by flag.

## Risks and mitigations

| Risk                                                          | Likelihood and impact                                    | Mitigation                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The provider changed the branch layout, the tree is empty     | Low likelihood, medium impact                            | An empty tree is a failure, the previous list stays; test `TestRefresh`                                               |
| The router clock is not synchronized at start                 | High likelihood on every power-on, low impact            | TLS will not pass without a clock, and the check is retried in an hour; a list dated in the future is checked at once |
| The selection refers to a category the provider does not have | Medium likelihood, high impact — sing-box does not start | Test `TestEmbeddedSnapshot` checks the selection against the snapshot list                                            |

## Compatibility, migration and rollback

The endpoint is new, existing ones do not change. The frontend snapshot `RuleSet.categories.generated.json` and the generator `apps/web/tools/ruleSetCatalog.ts` are removed. The `rule-sets.json` cache appears in the state directory after the first check, there is no migration. Rollback: the flag `-rule-set-refresh 0`: no check, the catalog is taken from the cache or the embedded snapshot, and the daemon does not go to the network.

## Validation

- `go test -race ./internal/ruleset/... ./internal/config/... ./internal/httpapi/...` — the GitHub client (200, 304, 403, truncated tree), the check schedule on a fake clock, retry after a failure, waiting at start from the cache and with a date in the future (`TestUntilStale`), rejecting a too short interval, the cache and the endpoint.
- `make schema-daemon` prints `CatalogSchema` into `daemon.generated.ts`.
- Panel tests: the form builds the URL from the chosen provider and list kind and shows the list date; the rule set table names the provider and list kind from the catalog.
- Live run: the daemon with an empty state directory starts from the snapshot, checks within seconds, writes `rule-sets.json` with permissions 0600, the endpoint returns `source: provider`.

## Links

- [PRD](../PRD.md): AC-7.
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) — the router clock and the state directory.
- [ADR-0012](./ADR-0012-generate-daemon-contract-schemas-from-sources.md) — generating contract schemas.
- [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md) — the user's custom lists.
- Code: `apps/metaboxd/internal/ruleset/`, `apps/metaboxd/cmd/rulesetsnap/`, `apps/web/src/entities/RuleSet/api/`.
