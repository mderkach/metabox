# ADR-0021. Print contract enumerations as value lists and keep parsing lenient

- Status: Accepted
- Date: 2026-09-16
- Deciders: repository owner

## Context and problem statement

The daemon gives the panel not only structures but also vocabularies: apply stages (`apply.Phase`), rejection codes (`contract.ErrorCode`), the origin of a claim and the match kind in route explanation. In Go these are named string types with a set of constants.

`contractgen` printed such a type by its base type — `z.string()` — and the value set did not reach the panel. The panel repeated it by hand: `SERVICE_STATUS`, `APPLY_PHASE`, the rejection text table in `failureText`. While the set stays the same, this works; when the daemon adds a new value, the panel does not learn about it. For rejection codes the cost is concrete: the user sees not a translation but the daemon's message in its language ([ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md)).

At the same time the panel has the opposite property, already accepted: adapters are lenient to unknown values and map them to safe ones — an unknown stage reads as a failure, an unknown origin as "nothing to compute with" ([ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md)). This behaviour is covered by tests: for the panel a guess presented as a fact costs more than a gap.

In scope: how the value set reaches the panel. Out of scope: structures and fields: the generator prints them as before.

## Decision drivers

- A new value in the daemon is detected before the device, not on the user's screen.
- Response parsing stays lenient: one unknown value does not blank out the whole screen.
- The generator artifact is deterministic: two runs give one file.
- The panel does not have to repeat a vocabulary by hand where the daemon already declares it.

## Considered options

1. **Print the values as a separate constant, keep the field a string** — next to the schemas appears `export const ERROR_CODE = ['not_found', …] as const`, and `code` in the schema stays `z.string()`. Pros: the panel types its tables with the daemon's set, and a missing value is a compile error; parsing does not change, adapter leniency is kept. Cons: strictness and parsing diverge — the wire type of the field is wider than the value set. **Chosen.**

2. **Print the field as an enumeration `z.enum([...])`** — the set enters parsing too. Pros: one entity instead of two, a value outside the set does not pass the boundary. Cons: an unknown value rejects the whole response, and instead of "stage unknown" the user gets "the panel could not parse the response". Checked on existing adapter tests: two of them stop compiling because they deliberately feed unknown values. Worst for the rejection code: together with the body the message in which the daemon explains the rejection is lost too. **Rejected.**

3. **Leave as is, keep the vocabulary in the panel by hand** — what there was. Cons: the user discovers the mismatch. **Rejected.**

## Decision outcome

`contractgen` collects the string constants of named types and prints them as a list for each type that appears in the contract:

```ts
export const ERROR_CODE = ['not_found', 'origin_mismatch', …] as const
```

The constant name is derived from the type name: `ErrorCode` → `ERROR_CODE`. One type is printed once, however many fields refer to it, and namesakes from different packages are told apart by package: `ROUTE_KIND` and `EVENTS_KIND`. Merging them by name is not allowed — they are different enumerations, and one would silently displace the other.

An untyped constant next to an enumeration is not counted as its member: in Go it is separate, and attributing it to a neighbour means inventing a value the type does not have.

Schema fields do not change — the wire keeps `z.string()`.

The panel types its tables with this set:

```ts
type ApiFailureCode = (typeof ERROR_CODE)[number];

const FAILURE_KEY: Readonly<Record<ApiFailureCode, ParseKeys<'shared'>>> = { … };
```

A `Record` over a closed set must be complete, so a new code in the daemon fails the panel compilation with the name of the missing value.

Parsing leniency does not change: the adapter still maps an unknown value to a safe one instead of dropping the response.

### Scope and boundaries

`apps/metaboxd/cmd/contractgen` and the artifact `apps/web/src/shared/api/daemon.generated.ts`. The constants reach the panel through the api segment of its slice, like the schemas.

## Consequences

### Positive

- A mismatch between the panel and the daemon is caught by the compiler. Checked with a probe: a rejection code added to the daemon gives `Property 'probe_drift' is missing in type …` in `failureText.ts`.
- The panel stopped rewriting the daemon's vocabulary by hand where it needs it complete.
- The godoc of the type and its constants stays the single home for describing the values.

### Negative

- The artifact gets constants the panel may not use: the generator prints all enumerations found in the contract.
- Strictness and parsing live apart: the wire type of the field is wider than the value set. This is a deliberate asymmetry, and its reason is recorded here.
- Namesakes from different packages get a name prefixed with the package: `route.Kind` and `events.Kind` give `ROUTE_KIND` and `EVENTS_KIND`. So the constant name depends not only on the type but also on whether it has a namesake in the contract: a `Kind` added somewhere else renames this one too.

### Neutral or deferred

- Field schemas do not change: response parsing stays exactly as it was.

## Compatibility, migration and rollback

The daemon response format did not change — only the generator output changed. An old panel with a new daemon and vice versa work as before: the wire carries a string.

Rollback: return printing of the base type: the panel then keeps vocabularies by hand again.

## Validation

- `make schema-daemon` and `cd apps/metaboxd && go test ./cmd/...` — the artifact is built from the current contract and is deterministic; generator tests cover separating namesakes and skipping an untyped constant;
- probe: add a constant to `contract.ErrorCode`, rebuild the contract, `pnpm --filter web build` must fail with the name of the missing code;
- `pnpm --filter web test` — adapters still read unknown values as safe.

## Links

- [ADR-0012](./ADR-0012-generate-daemon-contract-schemas-from-sources.md) — the panel contract is printed from the daemon sources;
- [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md) — the panel chooses the text, the daemon gives the code;
- [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md) — an unknown value reads as "unknown", not as a guess;
- [`apps/metaboxd/cmd/contractgen/emit.go`](../../apps/metaboxd/cmd/contractgen/emit.go), [`apps/web/src/shared/api/failureText.ts`](../../apps/web/src/shared/api/failureText.ts).
