# ADR-0085. Copy domain types into the daemon contract and pin repeated enum names in the generator

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner
- Supersedes (as to the contract referring to domain types and the generator loading them): [ADR-0012](./ADR-0012-generate-daemon-contract-schemas-from-sources.md)

## Context and problem statement

[ADR-0012](./ADR-0012-generate-daemon-contract-schemas-from-sources.md) put the daemon's response shapes into `internal/contract` and let the contract refer to domain types that go into a response whole. The panel schema `apps/web/src/shared/api/daemon.generated.ts` is printed from these sources by `cmd/contractgen`. Until this decision, `internal/contract` imported six domain packages: `apply`, `config`, `dataplane`, `devices`, `history` and `logs`, for `Transaction`, `Version`, `ListStat`, `Point`, `DevicePoint`, `Device`, `Model`, `AppliedReason`, `FieldError`, `Source`, `Entry` and the enums under them. The contract could not be compiled, read or generated without these packages, and a change in a domain package reached the panel promise without touching `contract` (issue #261).

The generator names an enum constant after its Go type. When two packages declare an enum with the same type name, it prefixes both with their package. `apply.ReasonCode` and `route.ReasonCode` give `APPLY_REASON_CODE` and `ROUTE_REASON_CODE`, and the panel imports these constants. If the type moves to `contract`, the default rule renames the constant to `CONTRACT_REASON_CODE`.

In scope: which package declares the domain types the contract returns, how the handlers fill them, and how the generator names enums that repeat across packages. Out of scope: the other roots of the generator, which stay in their own packages because the daemon returns them whole, not through `contract`: `device.Stat`, `diag.Report`, `events.*`, `route.*` and `ruleset.Catalog`. The JSON shape and the generated schema do not change.

## Decision drivers

1. **`contract` imports no domain package**, so the contract can be read and generated on its own (issue #261).
2. **The generated schema stays byte for byte the same**: the panel needs no change.
3. **The package layout keeps the daemon rules**: subject packages, no layer-named `models` package ([Architecture&Style](../../apps/metaboxd/docs/guides/Architecture&Style.md)).
4. **A drift between a domain type and its contract shape is caught by a test**, not by reading.

## Considered options

1. **Copy the types into `contract` field for field, with their godoc and enum constants, and map domain values into them in `httpapi`.** Drivers 1–3 hold. The copies are about 300 lines that must follow their domain types, so driver 4 needs a dedicated test. **Chosen.**
2. **Move the types into `contract` and make the domain packages import it.** There are no copies, but `contract` becomes the package of the domain's data types, a layer-named `models` package that the daemon guide forbids, and every domain package depends on the HTTP promise. **Rejected.**
3. **Move the types into a separate package of plain types that both the domain and `contract` import.** This has the same cost as option 2 plus a new package with no subject of its own. **Rejected.**
4. **Keep the contract referring to domain types.** The coupling from issue #261 stays. **Rejected.**

For the enum names:

1. **An explicit table of pinned names in the generator** for enums whose type name repeats across packages. One entry per name; the panel imports these constants. **Chosen.**
2. **Rename `route.ReasonCode`** so that the names no longer meet. This is an unrelated domain rename, and no clear name avoids repeating the package name. **Rejected.**
3. **Accept `CONTRACT_REASON_CODE`** and edit the panel. This breaks driver 2. **Rejected.**

## Decision outcome

- `internal/contract/domain.go` declares copies of the domain types the contract returns whole, with the same names, fields, tags, godoc and constant groups. `internal/contract` imports no `metabox/internal/*` package.
- `TestCopiesMatchDomainTypes` in `internal/contract/domain_test.go` compares the declaration source of each copy with its domain type: the type declaration and its constant group, doc comments included. A mismatch fails `make test`. It compares source, not reflect fields, because the schema carries godoc and constant values, which reflect cannot see.
- `internal/httpapi/contract.go` maps domain values into the copies, and `contract.Model` back into `dataplane.Model` for `PUT /api/dataplane`. A nil slice stays nil, so JSON keeps `null` apart from `[]`.
- `pinnedEnums` in `cmd/contractgen/main.go` maps `package.Type` to a constant name. It has priority over the package prefix: `internal/contract.ReasonCode` → `APPLY_REASON_CODE`, `internal/route.ReasonCode` → `ROUTE_REASON_CODE`.
- A new domain type in a contract response gets a copy, a mapping and an entry in `mirrored` of the test, not an import.

## Consequences

### Positive

- `contract` builds and generates without the domain packages.
- A change of a domain type that the panel sees fails a test until the contract copy follows it, so the promise to the panel changes only by an edit in `contract`.

### Negative

- About 300 lines of declarations exist twice, and every change to such a type is made in two places.
- The handlers carry mapping functions; a field added to both types but forgotten in the mapping is caught only by the handler tests.
- Enum names that repeat across packages need an entry in the generator table.

### Neutral or deferred

- The generator's other roots keep their domain types; a move of them into `contract` is a separate decision.

## Compatibility, migration and rollback

The JSON responses and `daemon.generated.ts` do not change: `make schema-daemon` gives no diff. Rollback is reverting the change; there is no stored data involved.

## Validation

- `go test ./internal/contract/` (`TestCopiesMatchDomainTypes`) and `go test ./cmd/contractgen/` (`TestGeneratePinsEnumNames`, `TestGeneratedFileIsFresh`) from `apps/metaboxd`.
- `go list -deps ./internal/contract` from `apps/metaboxd` lists no other `metabox/internal` package.
- `make schema-daemon` leaves `apps/web/src/shared/api/daemon.generated.ts` unchanged.
- Governed files: `apps/metaboxd/internal/contract/domain.go`, `apps/metaboxd/internal/contract/domain_test.go`, `apps/metaboxd/internal/httpapi/contract.go`, `apps/metaboxd/cmd/contractgen/main.go`, `apps/metaboxd/cmd/contractgen/emit.go`.

## Links

- [ADR-0012](./ADR-0012-generate-daemon-contract-schemas-from-sources.md): the contract generator.
- [ADR-0021](./ADR-0021-print-contract-enumerations-as-value-lists.md): enums as value lists.
- [HTTP API guide](../../apps/metaboxd/docs/guides/HTTPAPI.md), "Response shapes".
- Issue #261.
