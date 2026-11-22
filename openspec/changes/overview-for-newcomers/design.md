## Context

See `proposal.md` for the motivation. What exists now:

- `apps/web/src/pages/Overview/ui/OverviewPage.tsx` stacks `OverviewStatus` (the service card with the core controls), `OverviewTraffic` (tiles from `share` and `split`), `OverviewConnections` (the snapshot summary and the "Node" card, `OverviewNode`), `OverviewDevice` and `OverviewProcess`. `OverviewProcess` holds the daemon restart (`DaemonRestart`), the daemon version and the mode switch (`DaemonModeSwitch`).
- The core version is shown only in the service card on Overview. The sidebar footer shows the daemon version (`widgets/AppSidebar/ui/AppSidebarControls.tsx`).
- The daemon accumulates the link volume, the core volume and the split by kind over its uptime (ADR-0015, ADR-0074) and sends them in the `system` topic. The split was specified as AC-89 in `traffic-split-by-outbound`; that change is merged here, and AC-89 is folded into AC-97.
- The core commands ("Restart", "Stop", "Start") are in the core service card at the top of Overview (`DaemonServiceControl` in `OverviewStatus`), the same control as on Settings; "Start" and "Restart" are outline buttons and "Stop" a destructive outline. The panel restart (`DaemonRestart`) is in the panel daemon card of the process section (`OverviewProcess`). It polls `/connections` once a second for rule hits (ADR-0029).
- The mode switch is always shown, in the process section. The fork builds its mode list only from the `clash_mode` values of the config rules (`experimental/clashmode/mode_list.go`), so on a config without such rules the list has one entry.
- Fix #387 (stopped core leaves skeletons) is being made in `pages/Overview` by another session and lands before this change.

## Goals / Non-Goals

**Goals:**

- Answer three questions on one screen without schema knowledge: is it working; if not, what do I do; where does my traffic go.
- Keep everything P1 relies on reachable within one step: tags, versions, rule numbers, the daemon readings.
- Mark every number metabox computes (UX-8): the direct share, spread bytes, norms and levels.

**Non-Goals:**

- Explaining how outbounds and groups work: the "How metabox works" section, change 3. Overview does not link to it.
- A per-outbound history chart, a period selector, keeping history across a restart.
- New settings of the core: everything here reads runtime state or metabox metadata.

## Decisions

1. **AC-89 is withdrawn and folded into AC-97** (owner, 2026-11-20: merge the change). AC-89 described shares of the core volume as tiles; AC-97 describes shares of the internet connection volume, and both read the same daemon split. Keeping AC-89 as a narrowed daemon-only requirement would split one number across two requirements. AC-97 takes the daemon split by kind, "direct is outside the proxy share", the blocked connections apart (as a count) and the 375 px layout; AC-35 drops its reference to AC-89. Until task 1.1 removes `traffic-split-by-outbound`, AC-89 stays defined only there: a second definition fails `make trace-check` (`read_requirements` in `.github/scripts/trace-check.py`).
2. **Per-outbound traffic and latency history come from the polls the daemon already runs.** Traffic rides on the `/connections` snapshot. Latency comes from one `/proxies` read a minute, recording only new results. The daemon never runs a check itself. The panel offers a manual check for an individual server without a fresh measurement. Alternatives and costs: [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md).
3. **Row key is the outbound the rule picked**, the last element of `chains`, not the server in use, the first one. Connections matched by the default rule carry a `final` flag, so "everything else" has its own row even when it leads to the same outbound as other rules. One row per outbound of `route.rules` plus `route.final`, so the number of rows is bounded by the config, not by the number of subscription servers.
4. **Labels and manual norms live in a daemon state file keyed by tag; rule names stay as config comments** and the daemon only reads them: [ADR-0089](../../../docs/adr/ADR-0089-keep-outbound-labels-and-server-norms-in-the-daemon-state-and-rule-names-in-the-config.md). It compares this with ADR-0070 (config comments) and ADR-0048 (daemon state file).
   The shared proof for the route explanation and MCP uses the managed core startup snapshot, the local listener and the applied file ETag. The editor rechecks the ETag and its document before opening a position. See [ADR-0092](../../../docs/adr/ADR-0092-prove-applied-rule-links-from-the-managed-core-startup-snapshot.md).
5. **"The last version the core ran on" is recorded by the daemon.** When the traffic accounting stream of ADR-0015 reconnects and receives its first sample, the core is running. At that moment the daemon writes the sum of the current config (as in `Versions.CurrentSum`) to `<state_dir>/last-running.json`. The file is written only when the sum changes, so a running core costs no flash writes. The stopped-core block compares it with `current_sum` and finds the matching version id. Rejected: taking the last confirmed Apply. A core can crash on the same version after a subscription update (issue #338), and a version restored by hand over SSH was never confirmed.
6. **The cache recovery notice is a status field.** `contract.Status` gains `recovery` with the subscription tag, the reason the core gave and the time, set by the AC-92 recovery. The recovery itself starts the core, so the notice cannot end at the next start. It is kept in `<state_dir>/last-running.json`, next to the sum of decision 5, until `DELETE /api/status/recovery` (the dismiss action), so it survives a daemon restart and a dismissal holds in every browser. Both are long-lived daemon state; [ADR-0089](../../../docs/adr/ADR-0089-keep-outbound-labels-and-server-norms-in-the-daemon-state-and-rule-names-in-the-config.md) records where they live. The panel shows it in "Needs attention" (AC-96). It is a field in the existing status, not a new topic: the panel already polls the status, and the event is rare.
7. **Fallback targets of the links (AC-99) until later changes land.**

   | Name on Overview | Target now                                                                                                     | Target after                    |
   | ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------- |
   | "N rules"        | rules list with the outbound facet set (AC-38, new outbound facet)                                             | Simple mode, change 4           |
   | service          | the rule sets screen with the set's row expanded, `/config/rule-set?set=‹tag›` (AC-110 in `rule-set-contents`) | Simple mode of Routes, change 4 |
   | outbound, server | Proxies with the group or server highlighted                                                                   | Proxies, change 10              |
   | device           | Devices with the row focused                                                                                   | expanded row, change 5          |

8. **The mode switch shows only when the running config has rules with `clash_mode`** and sits in the Overview and Routes headers (AC-45 modified). Both use the same runtime control and reflect the same current mode. Its labels come from where the `clash_mode` rules lead: the outbound of the first rule with that mode. A mode with no single outbound keeps its name. Undo is a toast with a 10 s action. The banner lives in the app shell, beside the unavailability banner, and shows while the mode differs from the default one: `experimental.clash_api.default_mode`, else `Rule`, as the core takes it (`experimental/clashmode/manager.go` in the fork). The core builds its mode list from those rules only (`experimental/clashmode/mode_list.go` in the fork), so without them a switch changes nothing. Confirmed by the owner on 2026-11-20.
9. **Core version in the sidebar footer** under the daemon version, the full type and version in "Router and metabox". UX-7 then holds on every desktop screen with the sidebar open (owner, 2026-11-20). Deviations, recorded in the proposal: a collapsed sidebar has the version only in the accessible name and tooltip of the status dot; on a phone the footer is in "More", and the "More" button gets an amber dot when the core is older than the forms (the existing `more.withStatus` mechanism).
10. **Computed marks.** One visual mark across the screen for computed values, the same as the route explanation uses for `computed` (AC-34), with a toggletip that says what was computed from what. The mark is applied to: the direct share, the blocked count (computed from the core log), volumes and rates that include spread bytes, norms and levels. Counts of rules are read from the config, not computed, and carry no mark.

11. **Overview places Restart core in the header** (owner, 2026-11-22). The header states the status and groups Restart core with the routing control when available. The action keeps the danger treatment and interruption warning. The core service card keeps Stop and Start and avoids repeating the status. The panel daemon card retains the panel restart (AC-87); Settings keeps its service controls.

12. **Coordinator decisions approved by the owner on 2026-11-20.**
    - Blocked traffic is shown as a count of connections, not bytes; its source, the core log, is the owner's (decision 14).
    - A server in use that no check has measured makes the status "needs attention", with "Check" as the action. Configured URLTest groups and providers keep running their checks. On Overview, automatic results before the first user check for the server in the current core process can populate history. They leave the current value at "No measurement".
    - The recovery notice is kept in `last-running.json`, so a daemon restart does not lose it.
13. **On Overview, the core service card does not repeat the status word and dot.** The header carries them (AC-95). The owner approved this on 2026-11-20. Settings keeps its full service card.

14. **Blocked connections are counted from the core log** (owner, 2026-11-20). The connection snapshot cannot see them: a `reject` rule action returns before the trackers, and a `block` outbound closes at once. The daemon follows the core log with the reader the log screen uses (`internal/logs`) and counts two kinds of lines: `connection closed: rejected` from the router (`debug`) and `blocked connection to` or `blocked packet connection to` from a `block` outbound (`info`). The count lives with the AC-37 history and resets with the daemon. The daemon also reports whether the running `log.level` shows each kind, so the panel knows when the figure is unavailable. An empty `log.level` means `trace` in the fork (`log/log.go`), so both kinds show by default. Only the kinds the running config uses count: rules with the `reject` action, outbounds of type `block`. If one of them is hidden, the whole figure is unavailable, not a partial count. Rejects of DNS rules answer a DNS query and are not connections; they are not counted. The lines come from the redirect and tproxy path metabox uses; a `tun` inbound rejects some connections in pre-match without a line (`route/route.go`), which metabox does not use. The follower holds one of the four stream slots of the log reader (`MaxStreams`) for the daemon's uptime, so the log screen keeps three. Source and cost: [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md).

## Motion

AC-114 follows [ADR-0026](../../../docs/adr/ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md) for screen changes and stateful tabs and [ADR-0049](../../../docs/adr/ADR-0049-slide-side-panels-and-float-the-apply-bar-with-css-transitions.md) for contextual panels and the apply bar. On Overview, the attention and stopped-core notices expand or collapse in place. On Overview and Proxies, anchored help fades at its trigger while the surrounding geometry stays fixed. Live measurements update independently of these transitions. Reduced motion turns non-essential transitions off, with the same content, focus and controls.

## Design brief

Produced with `/impeccable shape`. The discovery round was the owner's review of the mockups on 2026-11-20. These points come from it: Overview shows and does not explain; the outbound row lists its lines with no arrows; readers outside the project see neutral names. Visual authority: `apps/web/DESIGN.md`, "The Night Console", unchanged: no new tokens, color only for route and health. Mode: operate.

**Who and when.** P1 opens it on the desktop next to an SSH session, checking that an Apply went well. P3 opens it on a phone when "a site does not open": the first screen after the panel root on a phone (AC-42). Both need a verdict first and detail second.

**Sequence (top to bottom), one question per block.**

1. **Header and core service card: "Is it working?"**
   - Header content:
     - the screen title;
     - one status: works, needs attention, core stopped, waiting for the first data from the core, the core sends no data, no link to the daemon, or works outside metabox;
     - the mode switch (only when the config has rules with `clash_mode`).
   - The Overview header shows Restart core for a running managed core, adjacent to the routing control when shown. The core service card shows uptime and Stop or Start for the applicable state. Settings keeps the existing service control. A core outside the managed service has no core command. The header owns the status word and dot.
   - States:
     - normal: works, with color on the status icon; "Restart" uses the shared danger outline and a restart icon on Overview. It uses the same height as the routing mode control when that control is visible. Its confirmation says connections through the core may be interrupted. "Stop" keeps its own confirmation;
     - needs attention: an amber status with the count;
     - core stopped: a coral status. When a prior version can be restored, the recovery block offers the primary "Return version ‹N› and start" and the service card offers the secondary "Start current version". Otherwise the service card offers the sole primary "Start".
     - core outside the managed service (AC-36): "works, started outside metabox", no core command;
     - no data yet: "waiting for the first data from the core";
     - the core sends no data (the traffic stream stalls, the device stream does not; NFR-1): "the core sends no data", amber, the commands stay;
     - no daemon: "no link to the panel daemon", the commands disabled.
   - At 375 px the title and the status share the first line, the switch wraps to a second line, and the card's buttons wrap under the uptime.
2. **Mode banner (every screen): "Is something overriding my rules?"**
   - Content: the mode name ("everything direct"), since when, and "Return to ‹default›".
   - Shown only while the mode is not the default. One line; at 375 px the action wraps under the text.
3. **Needs attention: "What broke and what do I do?"**
   - Content: one item per problem, in this order:
     - a group with no live server;
     - a server above its norm;
     - a server in use that was never checked;
     - a dropped subscription cache;
     - the dataplane check result once diagnostics gives it (#305).
   - An item has three parts:
     - a title that names the outbound or server;
     - a sentence with the servers (four, then "and N more") and the effect on rules ("8 rules: ‹name›, ‹name› and 6 more do not work now");
     - one main action and at most one secondary.
   - The main action by cause:
     - a manual-choice group: "Switch ‹group› to ‹outbound›";
     - a server in use that no check has measured: "Check ‹server›"; the sentence says its latency is unknown. Show "No measurement" until the user checks the server in the current core process. Do not start a check automatically;
     - a group that picks by latency: "Check the other servers of ‹group›", with the sentence saying why it did not switch (the group's tolerance);
     - a dropped cache: "Dismiss"; the subscription name and the reason are the content.
   - States:
     - normal: absent, with no empty placeholder;
     - needs attention: present;
     - core stopped: replaced by block 4;
     - no data: absent;
     - 375 px: actions go full width under the sentence.
4. **Core stopped (replaces 3 while stopped; 6 and 7 say "no data"; 5 stays as history): "Why is it down and how do I bring it back?"**
   - Content:
     - the title "The core is stopped" and a message that routing rules do not apply;
     - if interception remains installed after a crash, warn that intercepted devices may lose external access and DNS;
     - after an explicit Stop and confirmed removal of traffic and DNS interception, say devices may connect directly;
     - if evidence is incomplete, keep the stopped message and omit a claim about access. A successful Stop response or absence of traffic chains alone does not establish DNS cleanup. Use AC-52 as the behaviour contract and consume available observations without expanding the diagnostics screen (#305);
     - the reason in one sentence;
     - "The last version the core ran on is ‹N›";
     - the primary restore-and-start action when a prior version can be restored, with "Start current version" secondary in the service card. Otherwise the service card owns the primary Start action;
     - a secondary action, "Open the core log";
     - the error text folded under "Error text", monospace, as is.
   - States:
     - stopped by the user: no error; the start action follows the same version rules;
     - crashed: as above;
     - a rollback that could not bring the core up: the transaction reason is the reason;
     - 375 px: the actions stack.
   - The daemon readings (block 8) keep updating below.
5. **Where traffic went: "Where does my traffic go, overall?"**
   - Content:
     - a heading "Since ‹duration› · internet connection ‹interface› (i)";
     - one stacked bar, then two labelled values with volume and percentage: through a proxy and direct (computed mark);
     - "blocked" as a count of connections, without a percentage: blocked traffic never reaches the internet connection, and a blocked connection closes at once, so its volume is close to zero;
     - a quiet total line;
     - under it, the live rate chart of AC-37 (download and upload since the daemon started), as today.
   - The interface toggletip explains what an internet connection is and why there may be several. The Direct share combines traffic sent directly by rules and estimated traffic past the core. Its help explains that the outbound table sees traffic through the core for the listed tags. In the shared test with 100 MiB on WAN and 30 MiB proxy plus 20 MiB direct through the core, the bar shows 30/70 MiB, the rows show 30/20 MiB, and 50 MiB is the estimated bypass. An outbound removed from both the running config and the runtime list leaves the rows at the next config change. Its traffic stays in the totals by kind.
   - States:
     - normal;
     - blocked at zero: shown as "0", not hidden;
     - blocked unavailable (the running `log.level` hides the lines of a kind the config uses, or the log is disabled; a partial count is never shown): "unavailable" with an (i) toggletip that names the level it needs (`debug` for rules with the `reject` action, `info` for a `block` outbound), says that `debug` writes several lines per connection, and that the level is changed in the config, in the `log` section, through Apply;
     - blocked count incomplete because earlier log lines are missing: "unavailable" with help saying earlier lines for this uptime are missing;
     - blocked count: computed mark, its toggletip says it is counted from the core log since the daemon started;
     - if the estimate of traffic past the core is negative, its contribution to Direct is zero;
     - just started (under a minute): "collecting since the daemon started";
     - core stopped: the shares and the chart stay as history, with "the core is stopped" next to the period;
     - 375 px: the two shares in one column with values on one baseline (the defect from #243), and blocked under them.
6. **Outbounds and rules: "Which rules lead where, and is that way healthy?"**
   - Content: one row per outbound with traffic, sorted by volume; then "everything else" (default rule), even when its outbound also has a row; then outbounds with no traffic. Each row has:
     - the rules, by name or by content label, the first three, then "and N more", and "N rules" as a link;
     - the outbound label, or its tag in monospace when there is no label;
     - one line each: what it is ("group · manual choice", "group · picks by latency, from 4 servers", "direct, no proxy", "server"), "chose group ‹name› · picks by latency" when nested, "server in use ‹name›";
     - latency with the usual latency of the server ("163 ms · usually 180 ms", computed mark on "usually" unless the user set it);
     - current download and upload rates, with units;
     - connections now;
     - volume with units and its measurement period.
   - At 375 px the active server retains its visible text label. The current rate, latency and period volume keep their units and time context when the table header is absent.
   - A desktop table header, uppercase, per DESIGN.md: Rules · Outbound and server · Latency and norm · Rate · Connections.
   - States:
     - normal;
     - an outbound with no traffic: "no traffic now", dimmed;
     - a server above its norm: amber latency, with the reason in block 3, not here;
     - no answer: coral "no answer";
     - no fresh result: "No measurement" with "Check" for this server. A server in use that has never been measured also appears in block 3. After a successful check, show the fresh latency immediately. Until a manual or computed norm exists, show the value without "usually" and apply only the ceiling;
     - core stopped: replaced by "no data";
     - long names: labels and tags truncate with the full text in the accessible name;
     - 375 px: a row becomes a stacked card in this order: outbound, lines, then rules, then the numbers on one line.
7. **Open now: "Which devices are busy, and what went past my rules?"**
   - Two cards from the snapshot (AC-10), marked "open now".
   - Devices: up to five by volume, label, connections and volume; "and N more devices".
   - Left by the default rule: up to six destinations by volume, with the device or the number of devices. "+ Rule" next to a destination is not in this change: it is a rule made from an observed connection, #306 in change 4.
   - States:
     - none open: "no open connections";
     - core stopped: "no data";
     - no link to the daemon: "no data", without a skeleton;
     - 375 px: the cards stack.
8. **Router and metabox: "Is the router itself fine?"**
   - Content:
     - load and cores, memory, temperature, router uptime, internet connection speed;
     - core memory, pid and uptime; daemon memory, goroutines and version (AC-35 keeps all of them);
     - "core ‹type› ‹version› · interception: ‹all devices / selected devices›";
     - the panel daemon card keeps the panel restart with its confirmation, where it is today (AC-87 unchanged). The block adds no command and takes none from block 1.
   - Always live, also with the core stopped. A missing source blanks its own field (AC-35).
   - No link to the daemon: the last readings stay, marked as not updating, without a skeleton.
   - 375 px: folded under its heading, as the device section is today.

9. **Proxies: labels and usual latency (AC-104): "What do I call this outbound, and what latency is usual for it?"**
   - Content:
     - a group header shows its label in regular type and the tag under it in small monospace, or the tag alone; a pencil next to the name, outside the selection control, with the accessible name "Label: ‹tag›";
     - a server row, also of a subscription server, shows the label and tag the same way. Its own label pencil opens the label field. The norm belongs to a separate inline control ([AC-113](../../specs/proxies/spec.md#requirement-ac-113-each-servers-norm-is-edited-in-its-proxies-row));
     - mentions of a tag elsewhere (a member of another group) show the label without a pencil.
   - Edit a group or server label in place, as on Devices. The label accepts up to 64 characters. Its hint reads "Shown instead of the tag wherever an outbound is chosen. Empty: the tag again." Saving a label leaves the server's saved norm intact and the current latency stays in view. The form has Save and Cancel. Escape cancels and returns focus to the pencil. Errors appear under the field with `role="alert"`.
   - Saved labels go to the daemon at once, with no draft and no Apply. A toast and the live region say "‹tag› is now called ‹label›. Nothing to apply." The norm control's save and reset states follow AC-113.
   - "Labels without an outbound": a block at the bottom of Proxies, only when such entries exist. A row has the label, the tag, the usual latency, "Move to…" (picks a tag of the config or of the runtime list, subscription servers included, without an entry) and "Delete" (destructive outline, undo in the toast). A line says the tag may come back after a subscription update, which is why the daemon does not delete such entries itself.
   - States:
     - no entries: no marks, the tag alone;
     - live latency updates while a field is open do not reset the field or the focus;
     - `outbounds.json` broken, the endpoints are not registered: no pencils, tags only;
     - long labels (64 characters) and long subscription tags truncate with the full text in the accessible name;
     - 375 px: the label form stacks and its buttons are 44 px tall. The compact norm control reserves its own space as specified in AC-113.

**Interaction and layout.**

- Desktop: one column of full-width sections, with blocks 7 and 8 side by side.
- Reserve space for borders and icons in secondary controls. In Proxies group actions and the draft bar, changes to those borders and icons keep nearby controls and status text in place. Verify group actions and the draft ready-to-apply and awaiting-confirmation states at 320 and 375 px in both themes.
- Every name is a link (AC-99); the link names its target in its accessible name.
- Toggletips are 24 × 24 buttons that open on press or Enter and close on Escape, with `aria-expanded`.
- Number changes are not announced; a latency check result is announced through the screen's one live region, as now.
- No motion beyond the existing enter transitions.
- Both themes; contrast is measured per NFR-6.

**Words.** From `apps/web/docs/guides/Glossary.md`:

| English                         | Russian                          |
| ------------------------------- | -------------------------------- |
| core                            | ядро                             |
| outbound                        | выход                            |
| group                           | группа                           |
| manual choice                   | выбор вручную                    |
| picks by latency                | выбирает сама по задержке        |
| server                          | сервер                           |
| internet connection ‹interface› | интернет-подключение ‹interface› |
| download, upload (rate)         | скачивание, отправка             |
| downloaded, uploaded (volume)   | скачано, отправлено              |
| left by the default rule        | ушли по правилу по умолчанию     |
| past the core                   | мимо ядра                        |
| usual latency                   | обычная задержка                 |
| label                           | своё имя                         |
| Labels without an outbound      | Имена без выхода                 |
| Move to…, Delete                | Перенести на…, Удалить           |
| Needs attention                 | Требует внимания                 |

The last four are new; task 6.2 adds them to the glossary. A node is «сервер» on Overview, as the glossary sets for screens the redesign rewrites. No "sing-box" in texts except the core type in block 8. No summary sentences like "Now: …".

**Anti-goals.**

- No explanation of how groups work.
- No arrows between a group and a server.
- No green dot on every card.
- No skeleton that can last forever.
- No owner names or addresses in fixtures and screenshots: use neutral tags (`germany`, `ai-services`, `vpn-one/de-1`).

**Must not be invented by the builder.**

- The levels thresholds (ADR-0090).
- The order of "Needs attention" items (above).
- The link targets (decision 7).
- Whether the mode switch shows (decision 8).
- Where the core and panel commands sit (decision 11).
- When the blocked figure is unavailable (decision 14).

## Risks / Trade-offs

- [A never-checked server in use turns the header amber after every core restart] → the core keeps latency results in memory; a manual-choice group of link servers stays "needs attention" until the user checks it. The action is one press; if that proves noisy, the owner may limit the rule to servers that carried traffic.
- [The blocked count needs a log level the user may not run, and `debug` writes several lines per connection] → the figure says it is unavailable rather than showing 0, its help names the level; the parsing cost at `debug` is measured on the device in task 2.6. The log follower is a background reader, bounded in [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md).
- [The per-outbound volume includes spread bytes and can be off for outbounds with short connections] → computed mark and a toggletip; the device check in task 2.6 compares it with the connection summary under mixed load.
- [Two more background exceptions (the `/proxies` read and the log follower) and larger daemon state] → caps in ADR-0090; RSS and idle CPU measured on the device (task 2.6) against NFR-4.
- [Rule name grammar exists in Go and in TypeScript] → one shared fixture of comment layouts, tested on both sides (task 3.1).
- [Labels keyed by tag go stale on a rename] → `unused` mark and a remove action on Proxies.
- [The fallback link targets change in changes 4, 5 and 6] → the targets are listed in decision 7, and each later change updates its row and the AC-99 scenario.
- [Overview grows taller than today on a phone] → blocks 3 and 4 appear only on a problem; block 8 is folded at 375 px.
- [The panel restart confirmation still names only the charts and rule hit counts] → AC-87 stays as built, so its confirmation does not mention the traffic shares and the latency history that also reset; a known gap, not fixed here.
- [#387 and this change touch the same files] → this change starts after #387 is merged and rebuilds on it, not on today's tiles.

## Migration Plan

Contract additions are additive: an older panel ignores the new fields, the new panel ships in the same binary as the daemon. `outbounds.json` and `last-running.json` appear on first write; deleting them returns the panel to tags, to "last version unknown" and to no recovery notice. No config migration.

## Open Questions

None. The owner confirmed the start actions and manual first latency check on 2026-11-22. ADR-0090 records the alternatives and the required device measurements.
