## Why

Overview was built for a reader who knows the schema and has one proxy group.

- With several outbounds, the "Node" card turns into a stack of unlabelled dropdowns. It leaves out automatic groups and `direct` (#315).
- The traffic tiles describe the open connections, not a period: two video streams once read as "99 % direct".
- The stopped-core state introduced in #401 explains that live data is unavailable. It lacks recovery actions and a message based on the observed interception state.

A newcomer (persona P3 in `docs/PRD.md` §2.1) cannot answer the two questions Overview exists for: is everything working, and where does my traffic go. The owner agreed on the content of the screen on 2026-11-20 ("Agreed direction" in tracking issue #395). This change is item 2 of the checklist in #395.

Closes:

- #315: the "Node" card assumes one outbound.
- #364: the recovery from a poisoned subscription cache is not shown.
- #388: rule names are not available outside the rules list and in MCP.
- #393: outbounds have no human labels.

Refs:

- #243: verify the traffic split on a test device and at 375 px before closing it.

- #305: the dataplane check in diagnostics. Overview shows only its result.

## What Changes

- **Status in the header.** The screen states the core once, in its header: works, needs attention, core stopped, waiting for the first data from the core, the core sends no data, no link to the daemon, or works outside metabox. A server in use that no check has measured counts as needs attention.
  - The header holds no core command. "Restart", "Stop" and "Start" stay in the core service card at the top of the screen, as today and as on Settings, and the panel restart stays in the panel daemon card (AC-87 unchanged).
  - The green dots on every card go away, and so does the subtitle that repeats the status.
  - The core type and version move to "Router and metabox" and to the sidebar footer.
- **Needs attention.** The block appears only when something is wrong.
  - It names the servers (up to four, then "and N more") and what this means for the rules.
  - On Overview, a server shows "No measurement" and offers "Check" until the user initiates its first check in the current core process. Configured checks can still populate history.
  - It offers one main action that depends on the group type: switch a manual-choice group, or explain why a group that picks by latency did not switch.
  - A subscription the daemon dropped from the core cache (#364) is listed here until the user dismisses it.
- **Traffic over a period.** Two shares of the internet connection volume since the daemon started: through a proxy and direct. The Direct share combines traffic sent directly by rules and estimated traffic past the core. Its help explains that the outbound table sees only traffic through the core. The blocked connections are shown apart, as a count the daemon reads from the core log: they never reach the internet connection and close at once, so their volume is close to zero. When `log.level` hides those lines, the figure says it is unavailable and its help names the level it needs.
  - The heading says "internet connection ‹interface›", with an (i) toggletip.
  - The live rate chart of AC-37 stays under the shares.
  - The split by outbound kind that the daemon already accumulates (AC-89 in `traffic-split-by-outbound`) becomes part of AC-97. AC-89 is withdrawn: its tiles and the label "direct through sing-box" give way to the shares, and its daemon side is what AC-97 reads.
- **Outbounds and rules.**
  - One row per outbound that the rules lead to, plus "everything else" for the default rule. When the default rule leads to the same outbound as other rules, it still gets a row of its own.
  - The row lists its rules by name or by content.
  - On separate lines it shows what the outbound is, how it chooses, the nested group it chose and the server in use. There are no `group → server` arrows.
  - It also shows latency against the server's usual latency, the rate, the connections and the volume over the period.
- **Links.** "N rules" opens the rules list filtered by that outbound, until Simple mode exists. A service opens its rule set, a group or server opens Proxies, a device opens its row in Devices.
- **Core stopped.** A stopped core gets a block with:
  - the reason;
  - the last config version the core ran on;
  - one recovery action;
  - the error text, folded.

  Blocks without data say "no data" instead of showing skeletons. This builds on the fix for #387.

- **Daemon data.**
  - Traffic per outbound and per server, from the connection poll the daemon already runs.
  - A latency history per server and its usual latency.
  - Rule names as structured data, for MCP and for connections.
  - Human labels for outbounds and manual usual latency for servers, kept in the daemon state.
- **Routing mode.** The switch moves to the Overview header and appears only when the config has rules with `clash_mode`. A switch can be undone for 10 s. While the mode is not the default one, a banner on every screen says so.
- **Motion.** Screen and tab navigation, contextual panels and visible state changes use transitions. Reduced motion preserves the same interactions without movement.
- **Daemon contract, additive.**
  - New fields in the `system` topic and in the status.
  - New endpoints: latency history, labels and norms, dismissing the recovery notice.
  - In MCP, `metabox_config_version` and `metabox_connections` gain rule names (owner answer 4); a connection keeps the condition and action observed from the core and gets a name only after the loaded config revision and matched rule position are confirmed.
  - No field is removed or renamed.

## Capabilities

### New Capabilities

- `outbound-metadata`: what metabox knows about an outbound beyond the config: its human label, a server's manual usual latency, its latency history and the computed usual latency. AC-102, AC-104.

### Modified Capabilities

- `overview`:
  - AC-10 modified: the summary of open connections keeps the top devices and the destinations of the default rule, and the latency moves into the outbound rows.
  - AC-35 modified: it no longer names the traffic share of AC-89, which is part of AC-97, and it adds the core type and version and the interception mode.
  - New: AC-95 status in the header, AC-96 needs attention, AC-97 traffic shares over the period (with the split by outbound kind that AC-89 described), AC-98 outbound rows, AC-99 links from Overview, AC-100 core stopped, AC-101 traffic per outbound.
  - Withdrawn: AC-89, defined in the change `traffic-split-by-outbound` and never built into `openspec/specs/`. Its ID is not reused.
- `proxies`: AC-45 modified. The mode switch moves to the Overview header and shows only when the config has rules with `clash_mode`; a switch can be undone for 10 s; a banner shows while the mode is not the default.
- `panel`: AC-38 modified. The rules list gains an outbound facet, which is the target of "N rules". AC-111 adds a panel transition contract.
- `routing-rules`: new AC-103. Rule names reach the daemon, MCP and connections.
- `route-explanation`: AC-34 uses the same verified positional reference as AC-103.

## Conflicts with built requirements and principles

| ID                                             | What it says now                                                                                                                                                                                                                                                | What the redesign needs                                                                                                                            | Resolution                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-10 (`overview`)                             | "a summary of the live connection snapshot: rule action, network type, top proxy nodes and LAN devices, … latency of the nodes selected by groups … it describes the snapshot, not a period"                                                                    | Shares over a period, and rows per outbound with their latency                                                                                     | MODIFIED. The snapshot keeps the open-connections count, the devices and the destinations of the default rule, marked "open now". Where the dropped cards go: the rule action becomes the shares of AC-97, the top nodes and the latency become the rows of AC-98, the network type is dropped (the Connections screen filters by network), and so are the opened connections per minute and the "top proxy nodes" card |
| AC-37 (`overview`)                             | "The window equals the daemon uptime … a daemon restart resets them"                                                                                                                                                                                            | "Traffic shares over a period"                                                                                                                     | No change. The period is the daemon uptime, and the heading says so. The rate chart stays under the shares, also while the core is stopped                                                                                                                                                                                                                                                                              |
| AC-89 (`traffic-split-by-outbound`, not built) | "the labels say "through a proxy" and "direct through sing-box""; "the three volumes are shown apart"                                                                                                                                                           | The word "core" in texts (AC-94), and shares of the internet connection instead of tiles of the core volume                                        | WITHDRAWN, folded into AC-97 (owner, 2026-11-20). AC-97 carries its daemon split by outbound kind, its "direct is outside the proxy share" rule and its 375 px defect; the tile labels go. The folder `traffic-split-by-outbound` is removed in task 1.1                                                                                                                                                                |
| AC-45 (`proxies`)                              | "The current mode is shown and switched on the overview screen"                                                                                                                                                                                                 | The plan wants "the mode switch in the header with 10 s undo and a banner". The Simple mode plan wants it shown only when `clash_mode` rules exist | MODIFIED: in the Overview header, only when the config has rules with `clash_mode`, undo, banner (owner, 2026-11-20)                                                                                                                                                                                                                                                                                                    |
| AC-87 (`service`)                              | "Overview SHALL restart the panel daemon itself, next to the sing-box service controls"                                                                                                                                                                         | A header that states the core once                                                                                                                 | No change (owner, 2026-11-20): the panel restart stays in the panel daemon card, and the core commands stay in the core service card. The header holds no command                                                                                                                                                                                                                                                       |
| AC-27 (`service`)                              | "it shows the crashed state, the binary output as is and a start button"                                                                                                                                                                                        | "error folded, one recovery action"                                                                                                                | No change. The error text is shown as is when unfolded, and "Start" is the action when the current version is the one the core ran on. "Start" also stays in the core service card, as an outline button                                                                                                                                                                                                                |
| NFR-1 (`non-functional`)                       | "the verdict says sing-box is not working and links to the logs"; "the service dot shows "unknown""                                                                                                                                                             | No status dots on cards                                                                                                                            | No change. The header status is the verdict, the "core stopped" block links to the core log, and the dot NFR-1 means is the sidebar service dot, which stays. The third scenario, "The panel tells a silent sing-box from a lost daemon link", is the header state "the core sends no data" of AC-95, kept apart from "no link to the daemon"                                                                           |
| AC-28 (`service`)                              | "the UI SHALL show a warning" about a schema mismatch                                                                                                                                                                                                           | —                                                                                                                                                  | No change. The warning stays in the sidebar                                                                                                                                                                                                                                                                                                                                                                             |
| AC-35 (`overview`)                             | "Overview SHALL show device readings: load and number of cores, board temperature, used memory out of total, outward interface speed, the traffic share of AC-89, resident memory and pid of the sing-box process, daemon memory and goroutines, router uptime" | A quieter "Router and metabox" block; AC-89 withdrawn                                                                                              | MODIFIED: the reference to AC-89 goes, the traffic share is part of AC-97; the core type and version and the interception mode join the readings. The block keeps every other reading                                                                                                                                                                                                                                   |
| AC-36 (`service`)                              | "A sing-box process outside the managed service is told apart"                                                                                                                                                                                                  | Four header states                                                                                                                                 | No change. The header says the core works but was started outside metabox, and the core service card offers no command, as today                                                                                                                                                                                                                                                                                        |
| UX-7 (`docs/PRD.md` §7)                        | "binary version … visible without going to a separate screen"                                                                                                                                                                                                   | "type and version in the details"                                                                                                                  | Core version in the sidebar footer on every screen, full type and version in "Router and metabox". Owner answer 6                                                                                                                                                                                                                                                                                                       |
| UX-8 and AC-34 (`route-explanation`)           | "Data from the core, what metabox computed itself and what cannot be computed are marked differently"                                                                                                                                                           | Shares past the core, the blocked count from the log, spread bytes, median norms and levels                                                        | Each is marked as computed (AC-97, AC-101, AC-102). Counts of rules are read from the config and carry no mark                                                                                                                                                                                                                                                                                                          |
| NFR-4 (`non-functional`)                       | "Steady-state RSS ≤ 64 MB, idle CPU usage ≤ 1% of one core"                                                                                                                                                                                                     | Two new accumulators, the latency read and the log follower                                                                                        | Bounded by [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md), measured on the device in task 2.6                                                                                                                                                                                                                                                    |

## Impact

- Panel:
  - `apps/web/src/pages/Overview` is rewritten.
  - `features/Daemon/DaemonMode`, `features/Daemon/DaemonControl`, `widgets/Daemon/DaemonService` (also used by `pages/Settings/ui/SettingsSystem.tsx`), `widgets/AppSidebar`, `app/ui` (the mode banner, next to `DaemonBanner`).
  - The facets of the rules list (`widgets/Rule/*`, `entities/Rule`), `entities/Daemon` (new contract fields), `pages/Proxies` (label and usual latency fields).
  - The mock stand (`src/test/handlers.ts`), and the i18n dictionaries of the touched slices.
- Daemon:
  - `internal/route` and `internal/history`: per-outbound volume from the same snapshot, and rule names next to the matched rule.
  - `internal/clashapi`: a bounded latency read.
  - `internal/logs`: a follower that counts blocked connections in the core log.
  - `internal/config`: a state file for labels and norms through `config.Store`.
  - `internal/httpapi`: new endpoints. `internal/mcp`: rule names. `internal/contract`, with `make schema-daemon`.
  - `internal/apply` and `internal/singbox`: the recovery notice and the last version the core ran on.
- Documents: `docs/Verification.md`, the user documentation in English and Russian.
- Decisions, both new and `Proposed`:
  - [ADR-0089](../../../docs/adr/ADR-0089-keep-outbound-labels-and-server-norms-in-the-daemon-state-and-rule-names-in-the-config.md): where labels, norms and rule names live.
  - [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md): the per-outbound accumulator and the latency history. It extends ADR-0074, ADR-0029 and ADR-0015.

## Overlaps with other changes

- **`traffic-split-by-outbound`** (AC-89, the split by outbound kind; 2 of 10 tasks done, issue #243): merged into this change by the owner's answer of 2026-11-20. AC-89 is not moved word for word but withdrawn and folded into AC-97:
  - AC-89 counted shares of the core volume and labelled them "through a proxy" and "direct through sing-box". AC-97 counts shares of the internet connection volume, so a second requirement about the same numbers would only repeat AC-97 with older labels.
  - Kept in AC-97: the daemon split by outbound kind (proxy, direct, block), the bytes spread by weight, the split kept with the AC-37 history, "direct is outside the proxy share", the blocked traffic shown apart (as a count of connections: they close at once, so their volume is close to zero), and the one-baseline layout at 375 px.
  - Dropped: the tiles, the label "direct through sing-box" (AC-94 says "core"), and the second percentage on the direct tile.
  - Its done tasks are carried over as 1.2 and 1.3; the device check (#243) is task 2.6. Task 1.1 removes the earlier change and updates active references.
  - AC-89 is retained in the revision history.
- **`rollback-of-a-breaking-config`** (AC-14) and **`recover-from-a-poisoned-subscription-cache`** (AC-91…AC-93): independent.
  - AC-100 shows what they produce: `rollback_failed` with its reason, and the subscription dropped from the cache.
  - This change adds only the status field and its dismissal for the panel (#364).
- **`one-vocabulary`** (AC-94, merged in #403): the new texts use its glossary. When Overview is rewritten, «узел» on Overview gives way to «сервер», as the glossary plans.
- **`how-it-works`** (#396, another session): Overview does not link to it, by the owner's decision.
- **Fix #387** (a stopped core leaves skeletons), merged in #401. AC-100 replaces its single line with the full block.
- **Changes 4 (Routes, Simple mode) and 5 (Devices):** the links of AC-99 move to their new targets when those changes land: "N rules" and a service to Simple mode of Routes, a device to its expanded row. Until then, the targets are the screens that exist now.

## Out of scope

- The "How metabox works" section (change 3, #396), and any explanation of how outbounds work on Overview.
- Simple mode of Routes (change 4). This change adds an outbound facet to the existing rules list as the fallback target.
- "+ Rule" next to a destination of the default rule. It is a rule made from an observed connection: #306, change 4.
- The expanded Devices row (change 5, #397) and the contents of a service (change 6, #398).
- On Proxies: manual choice only in selector groups, the "Where servers come from" block, the full latency history view (change 10, #314). This change only adds the edit place for a label and a usual latency (AC-104).
- "Check a site from the router". It needs a daemon endpoint; it is on the roadmap and not agreed for this change.
- Diagnostics of the dataplane pieces (#305). Overview shows the diagnostics result once diagnostics gives it; the check itself is a separate fix.
- Whether a connection through a `urltest` group fails when every server of the group is dead (open question of #395). It matters for an automatic fallback outbound, not for Overview: AC-96 reports such a group as "no live server" either way.
- Keeping the history across a daemon restart. ADR-0015 keeps it in memory, unchanged.
- An active bandwidth test of a server. It comes later, only on a button, on Proxies.

## Owner answers

Answered on 2026-11-20 and applied to the specs, the design and the tasks:

1. **Routing mode switch.** Shown in the Overview header only when the running config has rules with `clash_mode` (AC-45). Without them the core has one mode and a switch changes nothing (`experimental/clashmode/mode_list.go` in the fork).
2. **Core and panel daemon commands stay where they are.** "Restart", "Stop" and "Start" stay in the core service card at the top of Overview, the same control as on Settings. The panel restart stays in the panel daemon card (AC-87 as built, no delta). The header states the status and holds no command. When a prior version can be restored, the recovery block offers the primary "Return version ‹N› and start" and the service card offers the secondary "Start current version". Otherwise the service card offers the sole primary "Start".
3. **Merge `traffic-split-by-outbound`.** Merged, with AC-89 withdrawn and folded into AC-97 (see Overlaps). Task 1.1 removes the folder.
4. **Rule names over MCP (#388): option (a).** Names are returned as written, with the URL mask of the log tail (everything after the host hidden) and invisible and control characters removed. The user documentation says a rule name is not a place for a secret, and the `metabox_config_version` tool description says names are returned with URLs masked instead of "every comment is removed". Rejected: (b) names as is, which would send a subscription link typed into a name to the model whole; (c) no names in MCP, which leaves #388 half closed.

   The research behind the answer (checked on 2026-11-20):
   - **sing-box Clash API.** `GET /rules` and `GET /connections` return rule contents and outbound tags verbatim; the config has no rule name. `GET /configs` leaves the API secret out. Sources: https://github.com/SagerNet/sing-box/blob/testing/experimental/clashapi/rules.go, https://github.com/SagerNet/sing-box/blob/testing/experimental/clashapi/connections.go, https://github.com/SagerNet/sing-box/blob/testing/experimental/clashapi/configs.go.
   - **Mihomo (Clash.Meta).** Secrets are left out of the answer rather than masked: proxy providers come back without the subscription URL, and `/configs` without passwords. Rule contents are verbatim. Source: https://github.com/MetaCubeX/mihomo/blob/Meta/adapter/provider/provider.go.
   - **Clash API dashboards (metacubexd, zashboard, Yacd-meta).** They show names, tags and rule texts as the API gives them. The only privacy switch found hides the public IP in zashboard. Found by a code search, not a full audit; source: zashboard, `src/components/overview/IPCheck.vue`.
   - **b4, the DPI-bypass daemon, through its own MCP server.** Its config is redacted by key: passwords, tokens, user names, proxy credentials and the MCP token become `[redacted]`. Its safe config download also redacts credentials inside URLs. Free-text strategy set names and public list URLs come back as is. Observed through its MCP tools `b4_get_config`, `b4_list_sets` and `b4_get_topic` (topic `system.web_server.mcp.enabled`).
   - **podkop.** Its diagnostics mask the sing-box config by key (`uuid`, `password`, `server` and others become `MASKED`) and a few router settings by key; tags and names go out as is (inferred from the key list, not run). Source: https://github.com/itdoginfo/podkop/blob/main/podkop/files/usr/bin/podkop.
   - **homeproxy.** The subscription updater writes the full subscription URL to its log; passwords are masked only in the input field. Source: https://github.com/immortalwrt/homeproxy/blob/master/root/etc/homeproxy/scripts/update_subscriptions.uc.
   - **Home Assistant.** The language model gets the names and aliases of the exposed entities verbatim, and an allowlist of attributes. Diagnostics redact by key (`async_redact_data`), never by value. Sources: https://github.com/home-assistant/core/blob/dev/homeassistant/components/homeassistant/llm.py, https://github.com/home-assistant/core/blob/dev/homeassistant/components/diagnostics/util.py.
   - **Kubernetes MCP server (containers/kubernetes-mcp-server).** Pattern masking of credentials applies to log notifications only; its README says it "does not sanitize tool results". Secrets are kept out by denying the resource kind. Source: https://github.com/containers/kubernetes-mcp-server/blob/main/README.md.
   - **GitHub MCP server.** Returns user-written titles and bodies; it strips invisible characters and HTML against prompt injection, not against secret leaks. Source: https://github.com/github/github-mcp-server.
   - **Guidance.** The MCP specification asks servers to sanitise tool outputs (https://modelcontextprotocol.io/specification/2025-11-25/server/tools). OWASP LLM02:2025 lists pattern-based redaction as one measure next to least privilege (https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/).
   - **metabox itself.** Outbound tags are free text too and already reach MCP unmasked; rule contents go out verbatim in `metabox_connections`.

   In short: these projects protect secrets by key or by leaving the field out, and user-chosen names go out as is. None of them was found to mask patterns in free text inside tool results.

5. **Blocked connections: counted from the core log.** The connection snapshot does not see them: a rule with the `reject` action returns before the connection trackers run (`route/route.go`, `RuleActionReject`), and a connection to a `block` outbound closes at once. The core writes a line for each, and the daemon already reads the core log for the log screen:
   - a `reject` rule: `connection closed: rejected` from the router, at `debug` level;
   - a `block` outbound: `blocked connection to ‹destination›` or `blocked packet connection to ‹destination›`, at `info` level (`protocol/block/outbound.go`).

   The count is marked as computed from the log. When `log.level` hides the lines, or the log is disabled, Overview says the figure is unavailable, and its help names the level it needs and says the level is changed in the config. An empty `log.level` means `trace` in the fork (`log/log.go`), so both kinds show by default. Only the kinds the running config uses count: rules with the `reject` action, outbounds of type `block`. If one of them is hidden, the whole figure is unavailable, not a partial count. Rejects of DNS rules answer a DNS query and are not connections; they are not counted. The lines come from the redirect and tproxy path metabox uses; a `tun` inbound rejects some connections in pre-match without a line (`route/route.go`), which metabox does not use.

6. **Core version and UX-7.** A "core ‹version›" line in the sidebar footer next to the daemon version, with the full version string of the binary; the core type and version with the interception mode in "Router and metabox" (AC-95, AC-35). Deviations from UX-7, recorded: on a collapsed sidebar the version is only in the accessible name and the tooltip of the status dot, as the daemon version is today; on a phone the footer is inside "More", one tap away, and the "More" button carries an amber dot when the core is older than the forms.
7. **Where a label and a usual latency are edited (#393 closes here): in place on Proxies.** A pencil next to a group name opens one field, the label. A pencil in a server row opens two fields in place, the label and the usual latency, like the device rename on Devices. Saving goes to the daemon at once, with no draft and no Apply. A separate block "Labels without an outbound" lists entries whose tag is gone, with "Move to…" and "Delete" (AC-104). Rejected: a side panel, which covers the current latency on a phone, and editing on Overview, which shows and does not explain.

## Open questions

None. The owner confirmed the following decisions:

1. A server in use that no check has measured makes the status "needs attention" with "Check" as the action (design decision 12): a missing measurement should remain visible without claiming traffic has failed. The recovery notice is kept in `last-running.json` across a daemon restart.
2. The service card on Overview carries no status word and dot (design decision 13): the header already says it, and the copy rules forbid restating.
3. The Russian word for "label" is «своё имя», as in the device rename and the «Имена без выхода» block; the glossary task adds it.
