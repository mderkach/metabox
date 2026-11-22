# Proposal

## Why

The server add form silently drops parameters from VLESS links. [#391](https://github.com/mderkach/metabox/issues/391) reports this for REALITY links carrying `spx` and `support-x25519mlkem768`.

## What Changes

- Show the names of omitted VLESS link parameters under the link field before the user adds the server.
- Let the user add the supported fields to the draft and keep the existing validation and subscription guidance.
- Describe what the import will write. A successful import only confirms that the draft has a server entry.

## Capabilities

### Modified Capabilities

- `config-editor` gains AC-111 for reporting omitted parameters when adding a server from a VLESS link.

## Impact

The server link parser, add form, English and Russian copy, tests and user documentation.

## Out of Scope

- Parameter reporting for other protocols and subscription ingestion can be specified in follow-up changes.
- The Overview and Routes redesign is tracked in [#395](https://github.com/mderkach/metabox/issues/395).

## Open Questions

- Should the importer preserve the explicit `support-x25519mlkem768` setting in VLESS REALITY links or continue to omit it and show its name in the warning? The pinned core supports the setting and defaults it to false. Preserving true changes the handshake for affected links and may change compatibility with older servers. Preserving the current mapping can leave newer servers unreachable. The recommended option is to import the explicit boolean. [Pinned core documentation](https://github.com/shtorm-7/sing-box-extended/blob/d9442d14b19ddd02605bf3ee893a171947038e19/docs/configuration/shared/tls.md#L797-L805)
