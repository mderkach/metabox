## Decisions

[ADR-0094](../../../docs/adr/ADR-0094-check-shared-subscription-cache-tags-before-apply.md) records the Apply validation boundary.

Use the daemon's existing JSONC projection for the three tag lists. Check the complete candidate in Apply before reserving or writing it. Leave shape and syntax checks to the existing parser and core. Report the cache conflict as a localized validation error. The rollback recovery path keeps restoring the original state as specified in [ADR-0088](../../../docs/adr/ADR-0088-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md).

Use the current JSONC draft in the panel. Put the tag lookup in the Config entity and have the editor form reuse it. The Simple subscription import can call it before staging. Treat literal tags as exact, use core-assigned position tags for untagged providers and endpoints, and leave URL and User-Agent outside the comparison.
