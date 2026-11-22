# Compact latency norm editor on Proxies

## Why

The server's usual latency is easiest to adjust beside the measurement and history that explain it. This change under [#395](https://github.com/mderkach/metabox/issues/395) provides an inline editor and an explicit return to the automatic norm.

## What changes

- Add an inline norm field to the server rows in Proxies. Give the column one automatic-default hint and each saved override its own manual indication and reset action.
- Keep the outbound name editor separate. Saving the norm and returning to automatic mode use the existing daemon metadata operation for that server.
- Reserve space so editing, saving and resetting keep the row and its neighbors in place.

## Capabilities

### Modified capabilities

- `proxies` gains AC-113 for the norm editor and its relationship to latency history. AC-104 keeps the metadata model and replaces its combined server editor interaction with the split editor flows in AC-113.

## Impact

The panel's Proxies latency and name controls change. The daemon API, stored metadata and existing latency history remain the source of truth.

## Out of scope

- Changes to the daemon, the stored norm's bounds and calculation, or how a check is scheduled.
- Changes to the Overview, unused metadata actions, or REALITY diagnosis work in [#391](https://github.com/mderkach/metabox/issues/391).

## Open questions

None.
