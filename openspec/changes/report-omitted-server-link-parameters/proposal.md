# Proposal

## Why

The server add form silently drops parameters from VLESS links. [#391](https://github.com/mderkach/metabox/issues/391) reports this for REALITY links carrying `spx` and `support-x25519mlkem768`. An existing node can also stop connecting after a server upgrade, while the latency result gives the operator no way to find the client setting.

## What Changes

- Show the names of omitted VLESS link parameters under the link field before the user adds the server.
- Let the user add the supported fields to the draft and keep the existing validation and subscription guidance.
- Preserve an explicit boolean hybrid key share setting from a VLESS REALITY link when the config schema supports it.
- Make the setting easy to find when editing an existing VLESS REALITY outbound. A failed manual latency check on a matching applied node can point to the setting and explain how to test it.

## Capabilities

### Modified Capabilities

- `config-editor` gains AC-111 for import omissions and AC-112 for editing the REALITY setting.
- `proxies` extends AC-11 with guidance after a failed manual check of an eligible node.

## Impact

The server link parser, add and edit forms, Proxies screen, English and Russian copy, tests and user documentation.

## Out of Scope

- Running an isolated core for automated A/B checks and changing the active configuration from a diagnostic would require separate changes.
- Parameter reporting for other protocols and subscription ingestion can be specified in follow-up changes.
- The Overview and Routes redesign is tracked in [#395](https://github.com/mderkach/metabox/issues/395).

## Open Questions

None.
