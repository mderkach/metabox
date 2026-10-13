# ADR-0005. Keep adapters of foreign APIs in the slice's `api` segment, not in a separate `src/adapters` layer

- Status: Accepted
- Date: 2026-09-12
- Deciders: repository owner

## Context and problem statement

[ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md) sets a three-layer config model: fork schema → adapter → application model. A screen depends on the application model, so a breaking change in the fork schema does not reach the screens. This requirement is not revoked; the only question is where the middle layer lives.

Before this decision, the [Architecture&Style](../../apps/web/docs/guides/Architecture&Style.md) guide promised a `src/adapters/` directory outside the FSD layers: "on a breaking change of the fork API, only it is edited". The `@adapters` alias is declared in `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.mocks.json` and in the layer list of the boundary linter `tools/fsdBoundaries.js`.

In practice, over six screens the directory never appeared, and the adaptation of foreign formats spread across the slices' `api` segments:

- `entities/Connection/api`: shapes of the connection snapshot;
- `entities/Proxy/api`: `/proxies` and `/providers/proxies`;
- `entities/Daemon/api`: the daemon status, runtime stream topics and the service state;
- `entities/*/model`: translating DTOs into the screen model.

The repository owner stated this as a rule along the way: "adapters should live in the api layer, not in a separate folder". When the question was raised, the rule was in effect, while the guide, the PRD and five configs said the opposite.

In scope: where the code that translates a foreign format into the application model is placed, and what to do with the `@adapters` alias. Out of scope: the three-layer model from ADR-0039 itself and the way the schema is obtained (ADR-0001): they do not change.

## Decision drivers

1. **The ADR-0039 requirement holds**: a screen does not depend on the shape of a foreign API, and a format change is fixed in one place.
2. **Boundaries are checked by a linter**, not by review: code placement is a rule that must have a machine check.
3. **High cohesion** (GRASP): code of one domain sits together, not spread across two trees.
4. **Maintenance cost**: how many places need editing when adding a slice and when bumping the fork version.
5. **FSD compliance**: the methodology describes seven layers, and a directory outside the layers needs its own bypass rules.

## Considered options

1. **The adapter is part of its slice.** The shape of the foreign API and the translation into the model live in the slice that works with that API: `entities/Connection/api/Connection.schema.ts`, `entities/Connection/model/Connection.adapter.ts`. Only the model goes out, through the slice's `index.ts`. Pros: driver 1 holds the same way as before (the model is visible from the outside, not the DTO), and boundaries are checked by the existing `fsd/boundaries` without a single new rule (driver 2); the domain is not torn apart (driver 3); a new slice needs no config edits (driver 4); there are exactly as many layers as in the methodology (driver 5). Cons: adapters of different APIs no longer sit in one directory, so "where are the adapters at all" is answered by the slice segment, not by the structure; a breaking change in the fork schema has to be fixed in several slices, not in one directory. **Chosen.**

2. **Bring back the `src/adapters/` directory.** Pros: literal match with the former guide text; all adapters visible in one place. Cons: a directory outside the layers has to be described in the boundary linter with a separate set of rules: who sees it, whom it sees, whether Public API applies to it (driver 2); Clash API DTOs move out of the only slice that uses them, and cohesion drops (driver 3); in practice the directory was never needed over six screens, so the decision introduces structure for a future that may never come (driver 4).

3. **Leave as is, with the rule only in a tech debt entry.** Pros: zero cost today. Cons: the guide, the PRD and five configs keep describing a nonexistent directory, and nothing checks the rule: the next contributor creates `src/adapters/` because the guide says so. This is the current state, recognized as debt. **Rejected.**

### Adapter form

Separately, the means of translating the shape into the model was considered.

1. **A plain schema plus a handwritten adapter.** The schema stays a `ZodObject` and is composed with `.extend()` and `.omit()`; any number of adapters live over one schema, including the reverse one. **Chosen.**
2. **`.transform()` inside the schema.** One artifact instead of two, but the schema becomes a `ZodPipe`: `.extend()`, `.omit()`, `.pick()` are lost, there is no reverse direction, and one schema starts serving exactly one screen. Rejected.
3. **`z.codec()` with `decode`/`encode`.** The library's own two-way mechanism, but a codec is just as pipe-like and removes composition; `.catch()` in it acts only on decoding, so degradation in the reverse direction is lost silently; normalization per ADR-0007 has no honest reverse direction at all: an unfamiliar origin collapses into `unknown`, and `encode` would have to be made up. Rejected.

## Decision outcome

There is no separate `src/adapters/` layer in `apps/web`. Code that translates a foreign format into the application model is placed as follows:

- **The shape of a foreign API is described by a schema**: a `<Slice>.schema.ts` file in the `api` segment of the slice that works with that API. The schema describes what came over the wire and translates nothing: `.transform()` inside it is forbidden, otherwise `ZodObject` becomes `ZodPipe` and loses `.extend()`, `.omit()`, `.pick()`, and `z.toJSONSchema()` stops being representable on the output side. The schema is not exported: the model is what leaves the slice.
- **The exception for "a format that is the screen model" no longer exists.** An earlier edition allowed the `Daemon` slice to expose the response shape as a model. The decision withdraws this: shape and model differ not in the amount of translation but in who owns them, and matching fields today do not oblige the screen to depend on a foreign format tomorrow.
- **Translation and failure**: a `<Slice>.adapter.ts` file in the `model` segment of the same slice. It also decides what a misunderstood response becomes: a failure of kind `Schema` (`shared/api/ApiError.ts`) when the screen makes no sense without the data, or a partial model with a visible degradation flag when there is something to show. A silent fallback is forbidden: "no data" and "response not parsed" are different things.
- **Parsing happens before the cache**, in the query options factory, not in `select`: `select` changes what the hook sees but not what sits in the cache, and the foreign shape would stay available to anyone who reads the data by key. The `fetch` function still transforms nothing and returns the response as is.
- **The fork config schema** stays generated in `shared/api/generated.ts` (ADR-0001), and its adaptation to the screen lives in `entities/Config` and `entities/Rule`.
- **The `@adapters` alias is removed** from `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.mocks.json` and from the layer list in `tools/fsdBoundaries.js`.

The ADR-0039 requirement keeps holding: a screen imports the slice's model, not the source shape, and a breaking change of a foreign format stops at the slice boundary.

### Scope and boundaries

The decision covers `apps/web/src`. It does not touch the daemon, the schema generator or the API contract. The three-layer config model (ADR-0039) and the way the schema is generated (ADR-0001) do not change.

## Consequences

### Positive

- The rule matches the actual code, and the existing boundary linter checks it: a DTO does not leave the slice because it is not in the Public API.
- The slice stays the unit of transfer: the whole domain sits in one folder together with its tests and mocks.
- Five configs stop describing a directory that does not exist.

### Negative

- A breaking change in the fork schema is fixed in several slices, not in one directory. This is softened by the schema being generated and its consumers being known from the types.
- The question "where are the adapters" is answered by a naming convention, not by the directory structure. The convention is written in the guide and checked in review.

### Neutral or deferred

- The golden round-trip fixtures that the testing guide placed in `src/adapters/__tests__/fixtures/` move to `entities/Config/__tests__/`; the config corpus itself is not collected yet, which is a separate debt item.

## Risks and mitigations

| Risk                                                           | Likelihood and impact | Mitigation                                                                                                                                                |
| -------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shape of a foreign API leaks into a screen component       | Medium, medium impact | The schema is not listed in the slice's `index.ts`, and the Public API is assembled by name; an import bypassing the barrel is caught by `fsd/boundaries` |
| Adaptation of one format spreads over several slices           | Low, medium impact    | The format belongs to the owner slice; a neighbouring slice gets the ready model through `@x` and does not parse the DTO itself                           |
| Bumping the fork version requires going through several slices | Medium, low impact    | The schema is generated, and a breaking change shows up as a type error at the usage sites: the compiler does the walk                                    |

## Compatibility, migration and rollback

No migration is needed: the code is already placed the way the decision records. Only documents and configs are edited: removing the `@adapters` alias, through which nothing is imported.

Rollback: bring the alias back into five configs and create a directory with its own boundary rules. The cost of rollback is the same five lines plus a linter rule.
