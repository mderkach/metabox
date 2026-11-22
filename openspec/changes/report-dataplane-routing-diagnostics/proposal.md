# Proposal

## Why

An incomplete interception setup after a router restart can appear only in the system log. [Issue #305](https://github.com/mderkach/metabox/issues/305) brings the result of the existing dataplane routing check into Diagnostics and the Model Context Protocol (MCP) diagnostics tool.

## What Changes

- Add a routing setup result next to the existing nftables chain check.
- Name the first failing part: the policy routing rule, local route, or DNS forwarding configuration.
- Report a skipped check when interception is disabled or the result is unavailable.

## Capabilities

### Modified Capabilities

- `dataplane` — extend AC-68 with the routing setup result in both diagnostics reports.

## Impact

The daemon extends its shared diagnostics report. The existing Diagnostics table displays the new result in English and Russian.

## Out of scope

- Service startup and Apply recovery retain the decisions recorded in #305 and #282.
- Overview presentation belongs to [#395](https://github.com/mderkach/metabox/issues/395). Server-link import belongs to [#391](https://github.com/mderkach/metabox/issues/391).

## Open questions

None.
