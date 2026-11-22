# Explain proxy group selection and server sources

## Why

The v11 Proxies screen distinguishes manually selected groups from automatic groups and shows where their servers come from. This addresses the misleading manual-choice action in [#314](https://github.com/mderkach/metabox/issues/314) and the inventory shown in the redesign tracked by [#395](https://github.com/mderkach/metabox/issues/395).

## What changes

- Show the configured selection behavior of each group and provide a manual selection control only for selector groups.
- Add the “Where servers come from” inventory for subscriptions and manually added servers, with known group memberships.
- Keep current latency, norm and failure evidence governed by AC-11 and AC-113.

## Capabilities

### Modified capabilities

- `proxies` gains AC-123 for group selection affordances and AC-124 for server sources and memberships.

## Impact

The Proxies screen combines config and runtime group and provider data. A source resolution design must define when the screen has sufficient evidence to attribute a server, show current membership or report an unknown source.

## Out of scope

- New norm or history calculations, storage, retention or a standalone history view. The current-versus-norm presentation and chart when managing a norm remain under AC-113.
- Changes to subscription acquisition, update behavior under AC-64, or the REALITY diagnosis and recovery under AC-11.
- Automatic conversion of one group type into another.

## Open questions

- Technical design must resolve source and group identities for duplicate or renamed tags, provider refresh and incomplete runtime data. It must also define which references support a group-use link or a definitive unused status.
