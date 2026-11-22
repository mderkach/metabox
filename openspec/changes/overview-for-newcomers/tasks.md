## 1. Before code

- [x] 1.1 AC-97, AC-35: fold the traffic split proposal into this change and remove `traffic-split-by-outbound` in one commit (owner, 2026-11-20):
  - delete the folder `openspec/changes/traffic-split-by-outbound/`; AC-89 then has no definition left, and this change does not add one;
  - `docs/PRD.md`: replace AC-89 with AC-97 in the "Runtime Dashboard" row of the module table and in the M2 milestone row, and link to this change in the `overview` row of the specs table; the revision history row 1.67 stays as history;
  - `docs/adr/ADR-0074-split-sing-box-traffic-by-outbound-kind-from-the-connection-snapshot.md`: replace every mention of AC-89 (context, option 2, links) with AC-97 in this change, and drop the link to the deleted folder;
  - `openspec/changes/connections-responsiveness/proposal.md`: point to AC-97. Keep the archived vocabulary proposal as a historical record;
  - spell out the existing proxy share in the built AC-35 so it does not reference a retired criterion;
  - add the AC-97 `go-test` rows for the daemon split carried over in 1.2 to `docs/Verification.md`.

  Verify: `pnpm --silent openspec validate overview-for-newcomers --strict`, `make trace-check`, `grep -rn "AC-89\|traffic-split-by-outbound" docs openspec` finds only historical references and the record of the merge.

- [x] 1.2 AC-97: the daemon accumulates the volume by outbound kind (proxy, direct, block) from the connection poll, with connections that open or close between snapshots. Carried over from `traffic-split-by-outbound`, task 1.1. Evidence: `apps/metaboxd/internal/history/volume_test.go` (`TestVolumeSplitsLiveConnections`, `TestVolumeGivesClosedConnectionItsTail` and the rest), `TestCounterSplitsVolumeByOutboundType` (`internal/route/hits_test.go`), `TestShareCarriesSplit` (`internal/device/device_test.go`); `make test`.
- [x] 1.3 AC-97: Overview shows the proxy and direct volumes and counts the proxy share over the proxied volume only. Carried over from `traffic-split-by-outbound`, task 1.2. The tiles are replaced by the shares in task 4.4, and their tests in `OverviewPage.test.tsx` are rewritten there. Evidence: `splits the sing-box volume into proxied and direct and counts the share over the proxy`, `names the rejected volume next to the direct share`; `pnpm --filter web test`.
- [x] 1.4 AC-100: start from `origin/main` with the #387 fix merged in #401. Verify the regression tests on this base with `pnpm --filter web test`.

## 2. Daemon: traffic per outbound and latency history

- [x] 2.1 AC-101: `history.Volume` accumulates bytes per outbound (last element of `chains`) and per server (first element) from the `route.Counter` snapshot, spreads unseen bytes as for kinds, and prunes tags absent from both the running config and runtime list at the next config change, while retaining their bytes in the kind totals. Use the AC-97/AC-101 WAN 100 MiB, proxy 30 MiB and direct-through-core 20 MiB fixture before and after removal. Tests in `internal/history/volume_test.go` for the AC-101 scenarios. Add the AC-101 `go-test` rows to `docs/Verification.md`. Verify: `make test`, `make trace-check`.
- [x] 2.2 AC-97, AC-101: the `system` topic carries `outbounds` and `servers` (bytes and rate per tag) and the blocked count with whether the running log level shows each kind of line (task 2.7), with `origin` computed where spread bytes are included; `make schema-daemon`. Add the mock stand data to `apps/web/src/test/handlers.ts`. Add the AC-101 contract test row to `docs/Verification.md`. Verify: `make test`, `pnpm --filter web test` (`tools/mockStand.test.ts`), `make trace-check`.
- [x] 2.3 AC-102: a latency reader in `internal/clashapi` and a `history.Latency` ring, as ADR-0090 sets out:
  - the last 10 results and 24 completed hourly medians per tag, at most 4096 tags and 64 successful samples for the open hour;
  - a 60 s read that records an entry only on a new core timestamp;
  - a vanished result recorded as "no answer" only when the tag is still listed and the core process is the same; clear the current result and failure streak on a core restart, retaining earlier observations as history. Test that configured checks before the first user check in the current process can populate history while Overview shows "No measurement". A tag removed from runtime starts a new baseline if it returns;
  - the usual latency (median of hourly medians, none before the first hourly median) and the levels. Test the no-measurement state separately from failure;
  - `GET /api/latency`, a mock handler for it, and `make schema-daemon`.

  Add `apps/metaboxd/docs/guides/DeviceIO.md` "Resources" to the list of background exceptions. Tests for the AC-102 scenarios. Add the AC-102 rows to `docs/Verification.md`. Verify: `make test`, `make trace-check`.

- [ ] 2.4 AC-96: `contract.Status` gains `recovery` (subscription tag, the reason the core gave, time), set by the AC-92 recovery. It is stored in `<state_dir>/last-running.json` with the sum of task 2.5 and kept until `DELETE /api/status/recovery`, across daemon restarts. Run `make schema-daemon` and add mock handlers. Tests: a recovery sets it and the recovery's own start does not clear it; it is read back after a daemon restart; a dismissal clears it. Add the daemon AC-96 rows to `docs/Verification.md`. Verify: `make test`, `make trace-check`.
- [ ] 2.5 AC-100: the daemon records the sum of the config the core last ran on in `<state_dir>/last-running.json` (written only when the sum changes) and returns it with the version list; `make schema-daemon`, mock handler. Tests: the first traffic sample after a start records the sum; a repeated start on the same sum does not write. Add the daemon AC-100 rows to `docs/Verification.md`. Verify: `make test`, `make trace-check`.
- [ ] 2.6 AC-97, AC-101, NFR-4 (#243): manual: on an isolated device bench, under mixed proxy and direct load, compare the per-outbound volumes and the kind split with the connection summary. Agree with the owner, before the run, what difference counts as agreement: the daemon spreads unseen bytes by weight, so the numbers will not match exactly. Record daemon RSS and idle CPU with about 5000 connections with neutral synthetic outbounds and subscriptions, against NFR-4, once at `log.level` `warn` and once at `debug` with the blocked-count follower running. Write the results into the Validation of ADR-0074 and ADR-0090, add the `manual` rows and close #243 once the device and 375 px checks pass. Use the disposable bench for any configuration or service changes. Verify: `make trace-check`.

- [x] 2.7 AC-97: the blocked connection count from the core log:
  - a follower over `internal/logs` started with the daemon, which reads new lines only (no replay of the existing log) and counts `connection closed: rejected` from the router and `blocked connection to` or `blocked packet connection to` from a `block` outbound;
  - it takes one of the reader's four stream slots for the daemon's uptime (the log screen keeps three), reopens the stream after a core restart or a log rotation without counting a line twice, and keeps the count with the AC-37 history;
  - read configured visibility per kind from `log.level` (empty means `trace`) and `log.disabled`. Detect `reject` rules and `block` outbounds, including inline providers. A hidden kind in use keeps that uptime count unavailable after logging becomes visible;
  - `make schema-daemon`, mock data in `apps/web/src/test/handlers.ts`;
  - add the follower to the background exceptions in `apps/metaboxd/docs/guides/DeviceIO.md`, section "Resources".

  Tests: lines of both kinds are counted once; a level of `warn` reports both kinds hidden and `info` only the `reject` kind; at `info` a config with `reject` rules is unavailable and one with only a `block` outbound is counted; an empty level counts both; a core restart continues the count without double counting; the daemon restart resets it. Add the AC-97 `go-test` rows to `docs/Verification.md`. Verify: `make test`, `pnpm --filter web test` (`tools/mockStand.test.ts`), `make trace-check`.

## 3. Daemon: rule names, labels and norms

- [x] 3.1 AC-103, AC-34: a rule name reader in Go with the grammar of ADR-0070, tested against a fixture of comment layouts that the panel's `readRuleNames` cases in `apps/web/src/entities/Config/__tests__/Config.model.test.ts` also read. Use the startup snapshot and the managed listener to confirm the loaded revision and position. Return the verified index and ETag to the panel. Verify that a stale revision or dirty draft opens only the rules list. Test matching proof, unconfirmed position and an A/B reorder on disk at the same length, retaining the observed condition and action without a name in the latter two cases. MCP `metabox_config_version` returns `rule_names` with URLs masked as in the log tail and invisible and control characters stripped, and `metabox_connections` returns the name only for a confirmed loaded revision and position. The `metabox_config_version` tool description no longer says that every comment is removed: it says rule names are returned with URLs masked. Tests for the AC-103 scenarios. Add the AC-103 rows to `docs/Verification.md`. Verify: `make test`, `pnpm --filter web test`, `make trace-check`.
- [ ] 3.2 AC-104: `outbounds.json` in `internal/config` through `config.Store` with the limits of ADR-0089; `GET /api/outbounds` with `unused`, `PUT /api/outbounds/{tag}`; `make schema-daemon`, mock handlers. Tests: write and reread, limits, a broken file disables the endpoints and is not overwritten, `unused`; `PUT` accepts a tag that is in neither the config nor the runtime list (the undo of a delete); a subscription tag with a slash, escaped in the path, reaches the right entry. Add the daemon AC-104 rows to `docs/Verification.md`. Verify: `make test`, `pnpm --filter web test`, `make trace-check`.

## 4. Panel: Overview

- [ ] 4.1 AC-95, AC-45: the header:
  - one status (works, needs attention, core stopped, waiting for the first data from the core, the core sends no data, no link to the daemon, or works outside metabox) and no core command; the silent core comes from `coreGap` of the #387 fix; a server in use that no check has measured makes it needs attention;
  - the core service card stays at the top with "Restart", "Stop" and "Start", without repeating the status on Overview. Restart uses the danger treatment and keeps the confirmation that explains possible interruption of connections through the core. "Start" is primary when there is no rollback. Otherwise the service card offers the secondary "Start current version";
  - the panel restart stays in the panel daemon card (AC-87 unchanged);
  - the mode switch, shown only when the running config has rules with `clash_mode`, labelled by where its rules lead, with a 10 s undo toast;
  - the mode banner in the app shell.

  Remove the per-card status dots and the subtitle. Add a "core ‹version›" line with the full version string next to the daemon version in the sidebar footer; on a collapsed sidebar put the version into the accessible name and tooltip of the status dot; on a phone give the "More" button an amber dot and an accessible name when the core is older than the forms (`more.withStatus`). Tests for the AC-95 and AC-45 scenarios, including "Restart warns about interrupted connections"; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, `make trace-check`, and an Impeccable critique by someone who did not write it, at desktop width and 375 px.

- [ ] 4.2 AC-96: the "Needs attention" block, with the item order, server cap and actions from the design brief, including the `recovery` item and the item for a server in use that was never checked, whose action checks it. Tests for the AC-96 scenarios; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it, `make trace-check`.
- [ ] 4.3 AC-100: the "core stopped" block, built on the #387 fix:
  - the reason and AC-52 message for observed retained interception, explicit Stop with confirmed traffic and DNS cleanup, or incomplete observation. Test each message with the restore/start priority independent of the message;
  - the last version the core ran on;
  - primary "Return version ‹N› and start" when available; otherwise the service card provides the sole Start button;
  - "Open the core log";
  - the error folded;
  - "no data" in blocks that need the core.

  Tests for the AC-100 scenarios; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it, `make trace-check`.

- [ ] 4.4 AC-97: the traffic shares bar, its proxy and direct shares and the blocked count, the "internet connection ‹interface›" heading with a toggletip, the computed mark on "Direct" and help explaining the difference from the outbound table, the blocked connections as a count with the computed mark, or "unavailable" with the toggletip that names the needed `log.level` (tests for the AC-97 scenarios "Blocked connections are counted from the core log" and "A log level that hides the lines"), and one baseline at 375 px in both languages (the defect of #243). Use the same WAN 100 MiB, proxy 30 MiB and direct-through-core 20 MiB fixture as the outbound accounting and rows checks. Assert 30/70 MiB (30/70%) in the shares, 30/20 MiB in the rows, a 50 MiB bypass estimate and unchanged shares after the proxy row is removed. This supersedes the tiles of `OverviewTraffic.tsx`. On `make dev-mock`, look at the block in the light theme and with a non-zero blocked count and with the count unavailable (carried over from `traffic-split-by-outbound`, task 2.3). Tests for the AC-97 scenarios; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it, `make trace-check`.
- [ ] 4.5 AC-98, AC-104: outbound rows replace the "Node" card (`OverviewNode.tsx` is removed):
  - rules by name or content label, and "N rules";
  - the kind, how it chooses, the nested group and the server in use, as separate lines;
  - the label before the tag;
  - latency against the norm, rate, connections and volume;
  - the sort order and the stacked layout at 375 px.

  Tests for the AC-98 scenarios and the AC-104 display scenario; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it, `make trace-check`.

- [ ] 4.6 AC-10: the open-now cards (devices by volume, destinations of the default rule), marked "open now"; the latency card is removed. Update the AC-10 rows in `docs/Verification.md` whose test titles change. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it at desktop width and 375 px, `make trace-check`.
- [ ] 4.7 AC-35, AC-95: the "Router and metabox" block with every AC-35 reading, the core type and version and the interception mode. It adds no command: the panel restart stays in the panel daemon card with its confirmation as built (AC-87), and the core commands stay in the core service card. Verify that the panel restart and the core restart open their own confirmations. Tests for the AC-35 scenarios whose titles change; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it at desktop width and 375 px, `make trace-check`.

## 5. Panel: links, rules facet, labels on Proxies

- [ ] 5.1 AC-38: an outbound facet in the rules list, read from and written to the address parameter. Test for the new scenario; row in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it at desktop width and 375 px, `make trace-check`.
- [ ] 5.2 AC-99: links from Overview to the targets of design decision 7 (rules list filtered by outbound, the rule sets screen at `/config/rule-set?set=‹tag›` with the set expanded, which `rule-set-contents` defines in AC-110, Proxies with highlight, Devices row), each with an accessible name that names the target. Tests for the AC-99 scenarios; rows in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it at desktop width and 375 px, `make trace-check`.
- [ ] 5.3 AC-104: labels and usual latency edited in place on Proxies, as block 9 of the design brief:
  - a pencil next to a group name opens the label field; a pencil in a server row opens the label and usual latency fields; the pencil sits outside the selection button of a manual-choice group, with its own accessible name;
  - saving sends `PUT /api/outbounds/{tag}` and creates no draft; an empty value removes it, so the row returns to the tag and the computed usual latency; the toast and the live region say nothing needs applying;
  - the "Labels without an outbound" block: "Move to…" writes the entry to the chosen tag and then removes the old one (two `PUT` requests, ADR-0089); "Delete" removes it with undo in the toast;
  - no pencils while the endpoints are not registered;
  - keep group actions in their own slots. At 320 and 375 px in both themes, check that secondary-action borders and icons leave adjacent controls in place. The distinction between manual-choice and automatic groups is covered by #314.

  Tests for the AC-104 scenarios "A group label is edited in place", "A server row edits the label and the usual latency", "A label is saved at once without Apply", "An empty value returns the tag and the computed norm", "Labels without an outbound are listed apart", "An unused label is moved to another tag" and "An unused label is deleted"; a `vitest` row per scenario in `docs/Verification.md`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it at desktop width and 375 px, `make trace-check`.

- [ ] 5.4 AC-95…AC-100: an e2e scenario on the mock stand for the normal, needs attention and core stopped states at desktop width and 375 px, in both themes, with neutral tags in the fixtures. In the mock stand draft flow, exercise the ready-to-apply and awaiting-confirmation states at 320 and 375 px in both themes. Within each state, verify that secondary-action borders and icons leave adjacent controls in place. Add rows in `docs/Verification.md`. Verify: `pnpm --filter web test:e2e`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it, `make trace-check`.

- [ ] 5.5 AC-111: verify the shared route transition in both directions, including browser history. Apply the panel motion guidance to the redesigned views, notices and contextual controls. Test the standard and reduced-motion paths on the mock stand, as well as the navigation fallback without the View Transition API. Assert final state, focus and stable popover geometry in both themes at desktop and 375 px. Add the scenarios to `docs/Verification.md`. Verify: `pnpm --filter web test:e2e`, `pnpm --filter web check:design`, an independent Impeccable critique, `make trace-check`.

## 6. User documentation

- [ ] 6.1 AC-95…AC-104, AC-10, AC-35, AC-38, AC-45: update the Overview description in `README.md` and `README.ru.md`, and the Overview screenshots in `docs/screenshots/` with neutral tags. Note in `docs/Recovery.md` and `docs/Recovery.ru.md` that the "core stopped" block offers the last version the core ran on, and that a rule name is not a place for a secret (it reaches MCP with only URLs masked). Note in the Overview description that the blocked count needs `log.level` `debug` for `reject` rules and `info` for a `block` outbound. The specs have no derived Russian translation in the repository; if one appears before this task, update it for `overview`, `proxies`, `panel`, `routing-rules` and `outbound-metadata`. Verify: manual: the English and Russian copies say the same, and `pnpm --filter web test` passes (`tools/vocabulary.test.ts`).

- [ ] 6.2 AC-95…AC-98, AC-104: add the new words to `apps/web/docs/guides/Glossary.md` with their English and Russian pairs: "usual latency" («обычная задержка»), "label" («своё имя»), "Labels without an outbound" («Имена без выхода»), "Move to…" («Перенести на…»), "Needs attention" («Требует внимания»). Verify: `pnpm --filter web test` (`tools/vocabulary.test.ts`).

## Workflow follow-up

- Archive in the last pull request of the change, after every task is ticked and `make trace-check` reports no error. `traffic-split-by-outbound` is removed first (task 1.1).
