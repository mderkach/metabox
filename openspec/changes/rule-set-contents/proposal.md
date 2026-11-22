## Why

Issue #398: a rule set name is chosen by a person, so the name alone does not tell a newcomer what a service is. Issue #245: the rule sets screen shows the update time and size of own list files since pull request #309, but a remote set still shows a dash, because only the core has its copy. This is change 6 of the Overview and Routes redesign tracked in #395. The changes `overview-for-newcomers` and `how-it-works` link a service to its rule set on the rule sets screen; that link has no place that explains the service.

The owner decided on 2026-11-20 not to read what a rule set contains: no entry counts and no sample domains. Reading the list on the device is the same kind of work as the product non-goal of parsing `geosite.dat`/`geoip.dat` on the router (`docs/PRD.md`, section 8), and listing the domains of a large category costs hundreds of megabytes. A service is described by its source and its use instead.

## What Changes

- **The daemon reports the core's copy of each remote set.** The core keeps a downloaded set in its cache file (`experimental.cache_file`, `cache.db` by default). The daemon copies that file without taking its lock, checks that the core did not commit a write during the copy, and reads from the copy only the record of each remote set of the applied config: the time the core last checked the address, the size of the downloaded file, and whether it came from another address. A new endpoint returns them (AC-108). The daemon never reads the list inside the record and never runs the core binary for it.
- **The panel describes a service without reading it.** The description comes from what the panel already knows: for a catalog set, the provider, the kind of list and the category as the provider names it; for another remote set, the host of its address; for an own list, that the user wrote it. It names the route rules and the DNS rules that use the set. No counts, no samples, no claim about the contents (AC-109).
- **The rule sets screen shows both in an expandable row.** A row expands to the description, the check time and the size, and the "Updated" and "Size" columns of remote rows get the same values. The screen opens with one set expanded when its address names it, so the links from Overview and "How metabox works" land on that set. The Simple mode of the Routes change later reuses the same block (AC-110).
- **Decision record** [ADR-0091](../../../docs/adr/ADR-0091-read-rule-set-check-times-from-a-checked-copy-of-the-cache-file.md): how the daemon reads the record without touching the core's lock, the RAM cost of the copy, and why reading the list was rejected. No new Go dependency in the daemon `go.mod`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rule-sets`: AC-108, the daemon reports when the core last checked each remote set; AC-109, the panel describes a set by its source and use; AC-110, the rule sets screen shows both in an expandable row.

## Impact

- `apps/metaboxd/internal/cachefile`: a read path from a checked copy, next to the existing edit with the core stopped.
- `apps/metaboxd/internal/clashapi/cachefile.go`: the targeted read of the config extended to the tag and address of `remote` entries of `route.rule_set`.
- `apps/metaboxd/internal/httpapi`, `internal/contract`, `cmd/contractgen` output `apps/web/src/shared/api/daemon.generated.ts` (`make schema-daemon`).
- `tools/schemagen/cachefile_test.go`: the fork writes remote sets into the fixture cache file.
- Panel: `apps/web/src/widgets/RuleSet/RuleSetTable`, `apps/web/src/entities/RuleSet` (the description and the rules that use a set, DNS rules included), `apps/web/src/pages/RuleSets` (the address that names a set), the router search of the rule sets route, the mock stand handlers in `apps/web/src/test/handlers.ts`.
- Documentation: `apps/metaboxd/docs/guides/DeviceIO.md` and `Architecture&Style.md` (the read path and the projection), `apps/web/docs/guides/Glossary.md` ("checked"), `docs/Verification.md`, `README.md` and `README.ru.md`.
- Issue #398 asks for entry counts and samples; its text is updated to the description this change delivers, and the change closes it.

## Out of scope

- Entry counts and sample domains of a set, by any means: dropped by the owner on 2026-11-20 (ADR-0091, option 6). Issue #398 is closed by the description instead.
- A human description of each catalog category: the catalog carries only the category name as the provider publishes it; writing descriptions for hundreds of categories is a separate issue if the owner wants it.
- The Simple mode service block: the Routes change of #395 creates Simple mode and reuses the block of this change.
- Searching a domain in a set ("is this site in the service"): ADR-0007 assigns it to `sing-box rule-set match`; a separate issue.
- `local` sets with a path outside `rule-sets/`: their time and size stay unknown, as after #309.
- Column choice, density and filters of the rule sets table: issue #245 names them, `apps/web/docs/guides/Tables.md` forbids features for later; they wait for a need.
- Refreshing a set from the panel: the Clash API of the fork has no rule set update.
- Re-pointing the links of `overview-for-newcomers` and `how-it-works` to the address parameter of this change: each of those changes updates its own link row.

## Open questions

None. The wording of the description was settled on 2026-11-20 by the coordinator under the owner's rule that interface copy is decided through Impeccable and best practice: the design.md template (option a). "Belongs to ‹company›" is a claim about the contents and is false for categories such as `ru-blocked` or `cn`; the template names the category as the provider calls it and claims nothing about what is inside.
