# ADR-0089. Keep outbound labels and server norms in the daemon state, and leave rule names in the config

- Status: Proposed
- Date: 2026-11-20
- Deciders: repository owner

## Context and problem statement

The Overview redesign ([`overview-for-newcomers`](../../openspec/changes/overview-for-newcomers/proposal.md)) needs three pieces of data that the core config cannot carry as fields.

- **Rule names outside the rules list** (issue #388). A rule's name already exists: the line comment above a `route.rules` item ([ADR-0070](./ADR-0070-name-route-rules-with-a-line-comment-above-the-rule.md), AC-86). The panel reads it from the config text. The daemon does not: `metabox_config_version` in MCP strips every comment, and a live connection reports its matched rule only as text (`rule_set=… => route(…)`).
- **A human label for an outbound** (issue #393): "Germany" or "AI services" in place of a tag. A newcomer picks an outbound by meaning, not by tag.
- **A manual latency norm for a server**: a distant server is normally at 500 ms and a near one at 150 ms, so a warning has to compare a server with its own norm. The fork's schema has no such field: `urltest.tolerance` is switch hysteresis, not a norm.

Facts that constrain the choice:

- `sing-box check` rejects unknown fields, so neither a label nor a norm can be a field of an outbound (ADR-0070, same argument).
- Servers that come from a subscription (`providers`) are not in the config text at all. Their tags look like `‹subscription›/‹server›` and exist only at runtime, so a comment in the config cannot carry anything for them.
- Every config change goes through Apply: `sing-box check`, a core restart and the confirmation window ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)). [ADR-0048](./ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md) rejected Apply for device names: a core restart for the sake of a label in a table. The same argument applies to labels and norms.
- Rules have no stable key: ADR-0070 rejected a side map for rule names because position and content change on every edit. Outbounds and servers do have a key, their tag.

In scope: where a label, a norm and a rule name live, and who reads them; where the daemon keeps the last version the core ran on and the cache recovery notice. Out of scope: the latency history and the computed norm ([ADR-0090](./ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md)); names for DNS rules.

## Decision drivers

1. `sing-box check` accepts the config unchanged.
2. Subscription servers can carry a norm and a label.
3. Setting a label or a norm does not restart the core.
4. The data survives a daemon restart and is the same in every browser.
5. One home per fact: rule names are not copied out of the config into a second place.
6. No new dependency; the cost on the router is small.

## Considered options

1. **Comments in the config, like rule names**: a `// label: Germany` line above an outbound. It is visible in the file and travels with a copied config. But it cannot reach subscription servers (driver 2), and every label edit becomes an Apply with a core restart (driver 3). A second kind of meaningful comment also makes the comment grammar harder to read and parse. **Rejected.**
2. **A state file of the daemon, keyed by tag**: `<state_dir>/outbounds.json` holds `tag → {label, norm_ms}` and is written atomically through `config.Store`, as `devices.json` is (ADR-0048). This covers subscription servers, needs no Apply and survives a restart. The drawbacks: a renamed tag leaves an orphan entry, and labels do not travel with a config copied to another router. **Chosen** for labels and norms.
3. **Browser storage**: no daemon work, but the data lives in one browser (driver 4). **Rejected.**
4. **Move rule names into the same state file**: one place for all "metabox metadata". Rules have no stable key (ADR-0070, option 3), and the names already live in the config. **Rejected** (driver 5).

## Decision outcome

- **Labels and norms.** Option 2.
  - `<state_dir>/outbounds.json` is an object `tag → {label?, norm_ms?}`. A label has at most 64 characters, without control characters. A norm is a whole number of milliseconds from 1 to 10000. At most 4096 entries; at most 4 KiB per request body.
  - The daemon reads the file once at start and keeps it in memory.
  - `PUT /api/outbounds/{tag}` writes the file before it updates memory and answers with the whole map. An empty label or norm removes that value; an entry with neither is removed.
  - Moving an entry to another tag (the "Labels without an outbound" block on Proxies) is two `PUT` requests from the panel: write the label and norm to the new tag, then send an empty entry for the old one. Chosen over a move endpoint because it adds no API surface and the order is safe: if the second request fails, both entries exist and the old one stays marked `unused`, so nothing is lost and the user can delete it. A move endpoint would make the switch atomic in one file write, which matters only if a half-done move could lose data, and here it cannot. When the new tag already has an entry, the panel asks before overwriting it. The new tag may be a subscription server known only from the runtime list. `PUT` accepts any tag within the limits, including one in neither list, so the undo of a delete can write the entry back; a tag is escaped in the path, since subscription tags contain a slash.
  - Labels and norms are edited in place on Proxies: a pencil next to a group name, and in a server row, as the device rename on Devices (owner, 2026-11-20).
  - `GET /api/outbounds` returns the map. Each entry carries `unused: true` when its tag is in neither the running config nor the runtime list of the core. The daemon never deletes such an entry by itself: a tag can come back after a subscription update.
  - A broken file at start leaves the endpoints unregistered and is not overwritten. The panel then shows tags only. This is the ADR-0048 behaviour.
  - The panel shows the label first and the tag after it, in small monospace type, wherever it names an outbound for a newcomer. The Editor keeps tags.
- **Rule names.** They stay where ADR-0070 put them. The daemon gets a reader for that comment, in the same grammar as `readRuleNames` in the panel, and returns `rule_names` indexed like `route.rules` next to a masked config version. A connection matched to a rule index ([ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md) and [ADR-0029](./ADR-0029-count-rule-hits-in-the-daemon-from-connection-snapshots.md)) carries that rule's name only when the daemon confirms the loaded config revision and the matched position in that revision. The condition and action reported by the core are returned independently of the name. MCP masks a config by key, which a free-text name has none of, so names go through the URL masking MCP applies to the log tail: a URL inside a name loses everything after its host, and invisible and control characters are removed. Other text in a name goes out as is; the user documentation says a rule name is not a place for a secret. Other comments stay stripped. The owner chose this on 2026-11-20 (issue #388) over returning names as is and over keeping them out of MCP. Projects with a similar API (the Clash API, Mihomo, Home Assistant, podkop) mask secrets by key and pass user-chosen names as is; masking URLs in a name adds the one mask metabox already has for free text. The `metabox_config_version` tool description says names are returned with URLs masked.
- **The last version the core ran on and the cache recovery notice.** Both live in `<state_dir>/last-running.json`, written atomically through `config.Store`.
  - The sum of the config the core last ran on is written when the traffic accounting stream gets its first sample after a reconnect, and only when the sum changed, so a running core costs no flash writes.
  - The recovery notice (subscription tag, the reason the core gave, time) is written when the daemon drops a poisoned subscription from the core cache, and removed by `DELETE /api/status/recovery`. It survives a daemon restart, so the user still learns about a recovery that happened while the panel was restarting.
  - A missing or broken file means "last version unknown" and no notice; the next write replaces it. Unlike `outbounds.json`, it holds nothing the user typed, so nothing is lost by replacing it.
  - Rejected: daemon memory only. A daemon restart would lose a recovery notice the user never saw.
- Non-goals: labels for DNS servers and inbounds; syncing labels between routers; deriving a label from the subscription name (possible later as a default, not stored).

### Scope and boundaries

The daemon: a new `outbounds.json` reader and writer in `internal/config`, `last-running.json` written from `internal/apply` and `internal/singbox`, its endpoints in `internal/httpapi`, `contract.Outbounds`, and a rule name reader used by `internal/mcp` and `internal/route`. The panel: `entities/Proxy` for the label function, and the Overview and Proxies screens.

## Consequences

### Positive

- Subscription servers get norms and labels like any other server.
- A label or a norm is saved at once, with no core restart and no confirmation window.
- Rule names stay in the file. MCP and connections show the same name as the rules list, and nothing is copied.

### Negative

- A tag renamed in the config loses its label and norm. The old entry stays and is marked `unused` until the user deletes or reassigns it.
- A config copied to another router does not take its labels and norms along. A version restore does not restore them either: they are not part of the config history.
- Rule name parsing exists twice, in TypeScript and in Go, and both must follow the ADR-0070 grammar. A shared fixture of comment layouts is needed so they do not drift.
- One more file in the service directory, as with `devices.json`.

### Neutral or deferred

- An export or import of `outbounds.json` together with the config.
- A label suggested from the subscription name.

## Compatibility, migration and rollback

Additive. No file exists before the first edit; an older daemon ignores it. Rolling back means deleting the file: the panel falls back to tags. The MCP results gain a `rule_names` field and a rule name on connections; clients that do not read them are unaffected.

## Validation

- Daemon tests: a label and a norm are written atomically and survive a restart; limits are enforced; a broken file disables the endpoints and is not overwritten; `unused` is set for a tag missing from the config and from the runtime list.
- Daemon tests: the rule name reader returns names indexed like `route.rules` for the same comment layouts as the `readRuleNames` cases in `apps/web/src/entities/Config/__tests__/Config.model.test.ts` (shared fixture); MCP masks a URL with a password inside a name.
- Panel tests: a label is shown before the tag on Overview; a label edit on Proxies sends `PUT` and creates no draft; an empty value returns the tag; a move sends the new tag first and the old one second; a delete sends an empty entry.
- Daemon tests: the last-running sum is written once per change of sum; the recovery notice is read back after a restart and removed by a dismissal.
- Files governed: `apps/metaboxd/internal/config` (outbounds store, last-running state), `apps/metaboxd/internal/apply`, `apps/metaboxd/internal/singbox`, `apps/metaboxd/internal/httpapi` (outbounds endpoints), `apps/metaboxd/internal/mcp`, `apps/metaboxd/internal/route`, `apps/web/src/entities/Config` (rule name grammar), `apps/web/src/pages/Overview`, `apps/web/src/pages/Proxies`.

## Links

- [`openspec/changes/overview-for-newcomers`](../../openspec/changes/overview-for-newcomers/proposal.md): AC-103, AC-104.
- AC-86 in [`openspec/specs/routing-rules/spec.md`](../../openspec/specs/routing-rules/spec.md); AC-73 in [`openspec/specs/mcp/spec.md`](../../openspec/specs/mcp/spec.md).
- [ADR-0070](./ADR-0070-name-route-rules-with-a-line-comment-above-the-rule.md), [ADR-0048](./ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md), [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md), [ADR-0029](./ADR-0029-count-rule-hits-in-the-daemon-from-connection-snapshots.md).
- Issues #388, #393.
