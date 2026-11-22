# Show routing details on each device row

## Why

The v11 Devices screen answers which rules are specific to a device, how its open connections were routed, and where to add a rule for it. This follows the Devices work in [#395](https://github.com/mderkach/metabox/issues/395), the device facet in [#327](https://github.com/mderkach/metabox/issues/327) and the row actions in [#397](https://github.com/mderkach/metabox/issues/397).

## What changes

- Expand the selected device's associated rules and open connections under its row, with a link to the full filtered Connections view.
- Offer the Simple Routes add-rule flow from that context with the device selected in advance.
- Retain the source of the device's name and the priority defined by AC-59.

## Capabilities

### Modified capabilities

- `devices` gains AC-121 for the routing detail and AC-122 for the device-scoped rule entry.

## Impact

Devices, Routes and Connections need a shared device association contract. The route explanation interface may need a bounded batch data path, to be decided before implementation.

## Out of scope

- A second route evaluator, new interception or static-lease behavior, and changes to the Apply protocol.
- A new device identity or naming model.

## Open questions

- Technical design must define the shared device-rule association predicate and its handling of unknown, overlapping, inverted or mixed source conditions. It must also define how the detail gets bounded route explanation data and distinguishes unknown routes from an empty result.
