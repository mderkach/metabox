## Why

A subscription, rule set, and endpoint can share a tag in separate core registries, but the extended core stores their cached data under the same key. A conflict can overwrite data and prevent the next core start. This change addresses [#379](https://github.com/mderkach/metabox/issues/379).

## What changes

- Reject a subscription tag shared with a rule set or endpoint before Apply can touch the configuration.
- Use the same tag rules in the existing editor and expose the check for the future Simple subscription form.

## Capabilities

### Modified capabilities

- `apply`: add a cache safety check and define the editor contract for preventing the same conflict before staging.

## Out of scope

- The Simple Routes screen and its subscription form. They are covered by `routes-simple-v11`.
- Cache migration, cleanup, or changes to the core's existing cache recovery.

## Open questions

None.
