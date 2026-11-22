# DNS and traffic path mismatch in Routes

## Why

A route can send traffic through a proxy while the matching DNS queries use a resolver that takes a different path. The v11 notice gives the user a way to see the affected entries and review a repair. This change tracks [#392](https://github.com/mderkach/metabox/issues/392).

## What Changes

- Report a mismatch when the panel can establish both paths from the same configuration revision.
- Show affected domains or patterns, the traffic exit, and the DNS path in Simple. Mark relevant entries in JSON and connect both views to the same finding.
- Stage a supported repair through the shared draft so the user can inspect, cancel, or apply it.

## Capabilities

### New Capabilities

- `dns-route-alignment`: a proven DNS and traffic path mismatch with a draft repair.

### Modified Capabilities

None.

## Impact

Use the existing configuration and draft. Catalog-service creation with a paired route and DNS adjustment is covered by AC-116 in Simple Routes. This change detects mismatches that already exist or arise after editing.

## Open Questions

- Which route and DNS match shapes can be compared reliably with the existing explanation and schema contracts?
- Which imported DNS rules can receive a repair without changing unrelated matches or their precedence?
