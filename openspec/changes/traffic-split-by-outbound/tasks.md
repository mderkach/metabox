## 1. Daemon and panel

- [x] 1.1 AC-89: the daemon accumulates the volume by outbound kind (proxy, direct, rejected) from the connection poll, with connections that open or close between snapshots. Evidence: `internal/history/volume_test.go` (`TestVolumeSplitsLiveConnections`, `TestVolumeGivesClosedConnectionItsTail` and the rest), `TestCounterSplitsVolumeByOutboundType`, `TestShareCarriesSplit`; `make test`.
- [x] 1.2 AC-89: Overview shows "Through a proxy" and "Direct through sing-box" and counts the link share of the proxy tile over the proxied volume. Evidence: `OverviewPage.test.tsx`, `splits the sing-box volume into proxied and direct and counts the share over the proxy`, `names the rejected volume next to the direct share`; `pnpm --filter web test`.

## 2. Panel gaps

- [ ] 2.1 AC-89: keep the two tile values on one baseline at 375 px in English and Russian. Verify: `pnpm --filter web test:e2e` with a 375 px scenario for the Traffic block, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it; screenshots at 375 px in both themes in the pull request.
- [ ] 2.2 AC-89: show the rejected volume and the direct share the way the owner answers in Open questions; no change if today's form is accepted. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it.
- [ ] 2.3 AC-89: manual: on `make dev-mock`, look at the Traffic block in the light theme and with a non-zero rejected volume; fix what is found under 2.1.

## 3. Device check

- [ ] 3.1 AC-89: manual: on the device, under mixed proxy and direct load, compare the split with the Connections summary; the difference stays inside the bound agreed in Open questions. Read-only: no Apply, no restart.
- [ ] 3.2 AC-89: manual: record daemon memory with about 5000 connections (shared with task 4.1 of `connections-responsiveness`).
- [ ] 3.3 AC-89: write the results into the Validation of ADR-0074. Verify: `make trace-check`.

## 4. Verification rows

- [ ] 4.1 AC-89: add the rows for 1.1, 1.2, 2.1 and the manual rows of 3.1–3.2 to `docs/Verification.md`; close issue #243. Verify: `make trace-check`.

## 5. Documentation

- [ ] 5.1 AC-89: if 2.2 changes what the tiles show, update the Overview description in the user documentation in English and Russian and the derived Russian translation of the `overview` spec. Verify: manual: both copies say the same.
