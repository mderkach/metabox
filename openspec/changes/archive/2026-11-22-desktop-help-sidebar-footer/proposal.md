# Proposal

## Why

Issue #465 follows #396 and addresses desktop navigation under #395. Overview takes the first position in the main navigation. The footer keeps Help available alongside support information.

## What Changes

- On desktop, the first main section is Overview and a dedicated Help link in the footer opens `/how-it-works`.
- The footer link has an accessible name in the expanded and collapsed sidebar, visible keyboard focus, and a current-page state on the help route.
- On phones, How metabox works stays first in More and the five bottom sections and Overview root redirect retain their behavior.

## Capabilities

### Modified Capabilities

- `how-it-works`: revise the placement of the existing help entry on desktop in AC-105.

## Impact

- Sidebar navigation, its English and Russian dictionary, and browser checks for the desktop footer and phone navigation.
- Update the English and Russian README navigation descriptions and the verification trace for AC-105.

## Out of scope

- Content and implementation of the help page, governed by AC-106 and AC-107.
- Contextual explanations on Simple Routes, delivered in #395.
- The historical #396 archive.

## Open questions

None. Issue #465 specifies desktop and mobile placement.
