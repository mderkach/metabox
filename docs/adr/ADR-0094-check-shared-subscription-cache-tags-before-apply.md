# ADR-0094. Check shared subscription cache tags before Apply

- Status: Accepted
- Date: 2026-11-23
- Deciders: Repository owner

## Context and problem statement

The extended core separates configuration registries, but its cache keys are bare tags shared by subscriptions, remote rule sets, and endpoints. The core's configuration check can accept aliases across those registries. The cache recovery in [ADR-0088](./ADR-0088-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md) cannot recover the overwritten entry.

## Decision drivers

- Reject collisions before writing a configuration.
- Keep raw configuration bytes and the core's schema validation.
- Cover raw JSON input and all clients that can start an Apply.

## Considered options

1. **Keep only the core check and rely on recovery.** This avoids reading more configuration fields in the daemon but leaves the overwrite possible. Rejected.
2. **Check a narrow projection of the submitted configuration.** This catches the overlap before applying it and requires no schema model, network call, or cache access. Chosen.

## Decision outcome

Apply checks the effective provider and endpoint tags and the explicit rule-set tags through a read-only projection of the current candidate. Form validation uses the same rule on the current draft. The core remains responsible for the structure and schema of the configuration.

## Consequences

- Raw JSON and form edits are covered by the same Apply gate.
- Existing aliases must be resolved before applying the affected configuration again. The projection must follow the core's tag defaults if they change.

## Compatibility, migration and rollback

Existing files and cached data are left in place. A new Apply, including an explicit restore from history, requires available tags. Automatic rollback can still restore the original configuration after a failed transaction.

## Validation

- [Cache tag check](../../apps/metaboxd/internal/clashapi/cache_tags.go) covers JSON with comments, implicit index tags, and tag reuse across registries.
- [Apply tests](../../apps/metaboxd/internal/apply/apply_test.go) verify the conflict is rejected before the core check and before a transaction or write.

## Links

- [Subscription cache tags specification](../../openspec/specs/apply/spec.md#requirement-ac-126-subscription-tags-do-not-alias-shared-cache-entries)
- [Issue #379](https://github.com/mderkach/metabox/issues/379)
