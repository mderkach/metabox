# Simple Routes

## Why

Users who do not know the core schema need to set up common routes in one place and understand what will change before applying. This change defines the Simple Routes workflow under [#395](https://github.com/mderkach/metabox/issues/395).

## What Changes

- Add Simple, Editor, and JSON views of one configuration draft. Simple presents interception, DNS, outbounds, and rules in that order.
- Keep routine actions in context. Use the same forms when setting up an empty configuration and when adding a service, custom site, server, or subscription to an existing configuration.
- Stage the matching route and DNS rule together when adding a catalog service and show both changes in the draft diff. Show the effective order and scope of rules. Present source and actual usage for a service from the catalog without promising access to the downloaded entries.
- Offer resolver inventory and assignments, supported DNS options, and device interception choices. Gate editing on the active core and preserve imported settings outside the supported controls.

## Capabilities

### New Capabilities

- `simple-routes`: Guided route editing, rule order, connection import, DNS, and device interception within the Routes screen.

### Modified Capabilities

None. This change builds on the existing configuration, Apply, dataplane, rule set, and server import contracts.

## Impact

The Routes screen uses the existing frontend configuration draft, device inventory, catalog, link import, and Apply and version-history interfaces. The implementation must confirm that the existing schema and daemon responses cover each supported operation before exposing it.

## Out of scope

- The Overview redesign in `overview-for-newcomers`, including its existing links to the editor. The Simple destination is introduced here.
- A redesign of the full schema editor or of whole-config JSON. Those views retain their existing capabilities.
- Inspecting downloaded rule sets or searching for domains in them. AC-109 governs the detail shown for a catalog set.
- The first-run wizard and its device step, which remain governed by AC-78 and AC-79. The empty screen in this change is an editable configuration.
- Detecting DNS and traffic paths that differ belongs to [#392](https://github.com/mderkach/metabox/issues/392). This change defines where a confirmed finding is shown in Simple.
- Replacing the Proxies inventory and diagnostics, which remain in [#314](https://github.com/mderkach/metabox/issues/314) and the existing REALITY recovery contract.

## Open questions

- Which imported resolver rules and fallback chains can the supported schema map losslessly to Simple, and which must stay view-only? Confirm the support matrix before implementing writes.
- Which core and router combinations support creating an optional HTTP/SOCKS listener through Simple, and what verified access rules make that safe? Expose only supported and verified cases.
- Which server or subscription links can be distinguished without a network request, and how should ambiguous links and duplicate candidates be resolved? Keep any explicit choice and diagnostic text in the same flow.
