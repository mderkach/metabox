# Design

## Context

Both the HTTP Diagnostics screen and the read-only Model Context Protocol tool consume the same daemon report. The existing init command checks policy routing before checking DNS forwarding. The device can start its core even if interception setup is incomplete.

## Goals and non-goals

Show the first failed component as one row alongside the nftables chain check. Keep the result independent of the Overview layout and service startup.

## Decisions

- Invoke the existing `dataplane_check` command with a report argument. Both modes use the same checks in the same order. Report mode emits a stable result for the daemon to map to localized labels. Apply keeps its current command behavior.
- Reuse the report row, status, and reason fields. Display a short localized cause next to the standard failure status. Report absence of a usable result as skipped. Map the row to interception in the shared diagnostic model so its consumers see a problem in the existing area.
- The read-only tool contract follows [ADR-0055](../../../../docs/adr/ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md). Historical startup behavior was accepted in [#305](https://github.com/mderkach/metabox/issues/305).

## Alternatives considered

- Parse the current command's human-facing error. Translations and older init scripts could make the daemon mislabel a failure. Running that mode during polling would also write a fresh syslog failure each time.
- Run separate Go checks for the policy rule, local route, and dnsmasq fragment. The daemon and Apply would have independent definitions of a healthy setup.
- Show three independent rows. One result is sufficient to match the existing check and name its first failure. An individual result for every part would require checking later stages after an earlier failure.
- Refuse to start the core on partial interception failure. The owner rejected this on 2026-11-14 because it can take affected LAN devices offline.
