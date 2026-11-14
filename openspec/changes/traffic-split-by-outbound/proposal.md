## Why

Overview has to show how much traffic went through a proxy and how much sing-box released direct, so that direct traffic does not read as proxied. The split shipped in PR #217; it has not been compared with real traffic on the device, and the tiles break at 375 px.

Issue: #243.

## What Changes

- On the device: compare the split with the Connections summary under mixed proxy and direct load, and measure daemon memory at 5000 connections.
- Fix the tile layout at 375 px: the Russian label "Напрямую через sing-box" wraps to two lines and its value sits lower than the neighbouring one.
- Look at the block in the light theme and with a non-zero rejected volume on the mock stand.
- Decide how the rejected volume is shown (see Open questions) and change the tiles if the answer differs from today.
- Add the AC-89 rows to `docs/Verification.md` and the device result to the Validation of ADR-0074, which says "Not done".

## Capabilities

### Modified Capabilities

- `overview`: AC-89.

## Impact

- `apps/web/src/pages/Overview` (`ui/OverviewTraffic.tsx`, `ui/OverviewTile.tsx`, `lib/Overview.traffic.ts`, `i18n/`): the layout fix and, if decided, the rejected volume.
- `docs/Verification.md`, `docs/adr/ADR-0074-split-sing-box-traffic-by-outbound-kind-from-the-connection-snapshot.md`.
- The device: a manual run, read-only.
- `apps/metaboxd/internal/history`, `internal/route`, `internal/device`: only if the device comparison finds a wrong split.

## Already built

Built and covered by unit tests; the device check and the narrow layout from issue #243 are open.

- The daemon accumulates the split from the connection poll: `apps/metaboxd/internal/history/volume.go`, `internal/route/volume.go`, `internal/device/share.go` (paths from ADR-0074). Tests: `TestVolumeSplitsLiveConnections`, `TestVolumeCountsNewConnectionFromZero`, `TestVolumeKeepsConnectionBetweenSnapshots`, `TestVolumeGivesClosedConnectionItsTail`, `TestVolumeCarriesUnweightedRemainder`, `TestVolumeStartsFromBaseline`, `TestVolumeRebasesOnProcessRestart` (`internal/history/volume_test.go`), `TestCounterSplitsVolumeByOutboundType` (`internal/route/hits_test.go`), `TestShareAccumulates`, `TestShareCountsWithoutReads`, `TestShareCarriesSplit` (`internal/device/device_test.go`).
- The panel: `apps/web/src/pages/Overview/ui/OverviewTraffic.tsx` shows two tiles, "Through a proxy" and "Direct through sing-box" (`i18n/en.json`, `i18n/ru.json`); the proxy share of the link is counted from `split.proxy`. Tests in `OverviewPage.test.tsx`: `splits the sing-box volume into proxied and direct and counts the share over the proxy`, `names the rejected volume next to the direct share`.
- ADR-0074 is `Accepted`; its Validation lists the device comparison and the memory at 5000 connections as not done.
- Differences from the requirement text found in the code:
  - the rejected volume has no tile of its own: `toDirectContext` (`lib/Overview.traffic.ts`) names it in the note of the direct tile, only when it is above zero and the link has been measured;
  - the direct tile shows its own share of the link next to the proxy one.

## Out of scope

- AC-37 (the daemon keeps runtime history for its uptime) and AC-35 (device readings on Overview): built, in `openspec/specs/overview/spec.md`. The split resets with the daemon like the rest of that history.
- AC-10 (the connection summary on Overview) and the Connections summary widget: used as the reference for the comparison, not changed.
- The "Node" card for a config with several exit nodes (issue #315) and the Overview heading order, contrast and 10 px text (issue #318).
- Responsiveness of Connections at 5000 connections (AC-30, `openspec/changes/connections-responsiveness/`).

## Open questions

- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- The scenario says the three volumes are shown apart. The rejected volume is a note inside the direct tile and is hidden when it is zero or the link is not measured. Enough, or does it need its own tile or line?
- The requirement says the channel share is counted over proxy traffic only; the direct tile also shows a share of the link. Keep that second percentage or remove it?
- What difference between the split and the Connections summary on the device counts as agreement? ADR-0074 spreads bytes the snapshot did not see by weight, so the two will not match exactly.
- At 375 px: shorten the Russian label, let both labels take two lines, or stack the tiles?
