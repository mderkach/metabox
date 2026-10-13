# ADR-0035. Build node forms by introspecting the generated Zod schema, not by code generation or a third-party renderer

- Status: Accepted
- Date: 2026-09-28
- Deciders: repository owner

## Context and problem statement

AC-5 requires every inbound/outbound type from the fork checklist to have either a hand-written form or an auto-generated renderer; no node is left without a renderer. AC-6 requires the "VLESS/Reality + rule-based routing" config to be built in the UI from scratch and to pass `sing-box check` without manual edits. Today only the routing rule is edited through a form; section nodes open as JSON (the shared sections screen), and that does not close AC-5.

Constraints set by existing decisions and code:

- A schema for all fork types already exists, and there is one: `tools/schemagen` prints strict Zod schemas with 106 types from seven registries (on `v1.14.0-extended-2.7.1`), the registries are combined into `z.discriminatedUnion("type", …)`, and the fields keep the fork's godoc ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), `apps/web/src/shared/api/generated.ts`). A second model of the same types diverges at the first fork bump.
- A node with a field the schema does not know is marked "not covered by the UI" and is edited as text ([ADR-0018](./ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md)); a form must not lose such fields and has to yield to the text mode.
- Editing is anchored to the file text: the form returns the node value, the write goes through `setValue` by path, neighbouring bytes are not touched ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md)).
- A node type missing from the binary build is shown by the panel as a warning; when a node is created, the type has to be marked in the picker itself (`BUILD_TAG_OF_TYPE`, `BUILD_TAG_OF_OPTION`, [ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md)).
- Hand-written forms are already built on React Hook Form + the Zod resolver (`features/Rule/RuleEdit`); a new frontend dependency is a separate decision.

In scope: the mechanism by which the panel gets a form for an arbitrary node type, and the place of hand-written forms next to it. Out of scope: the set of hand-written forms beyond the AC-6 scenario and the design of specific widgets.

## Decision drivers

- One source of truth about fields: the form follows the schema without a hand-written field table per type.
- A fork version bump does not require changes to the renderer: new types and fields are picked up by rebuilding the schema.
- Compatibility with ADR-0004/0018: the node value goes back into the text in place, unknown data is not lost.
- No new significant dependency.
- A hand-written form can replace the auto-generated one for an individual type when needed.

## Considered options

1. **Runtime introspection of the Zod schema: a "schema kind → widget" table.** The renderer walks the `def` of the node schema (Zod 4 exposes the kind, nesting, `optional`, `enum` values, the description from godoc) and picks a widget from the table: string → text input, number → numeric input, boolean → switch, enum → select, string array → list editor, nested object → collapsible group, uncovered kind → raw JSON of the subnode. The node type is picked from the variants of the registry's `z.discriminatedUnion("type")`; types unavailable in the binary build are marked per ADR-0030. A hand-written form is registered on top, as an entry in a "type → component" table, as the polymorphism rule of Architecture&Style requires. No new dependencies; the schema stays the only source. Drawback: the renderer depends on Zod's internal representation (`def` is a library API, but its stability is weaker than that of the public `parse`), and the auto-form quality is limited by what is visible from the schema. **Proposed for acceptance.**
2. **Code generation of form descriptors in schemagen.** The generator prints, next to the schema, a field table for each type (name, kind, hint), and the renderer reads it instead of Zod. More resilient to changes in Zod internals, but it adds a second printed representation of the same types: any mismatch between the schema and the descriptors is a new class of generator bugs, and `generated.ts` grows while already at 300 KB. Rejected: the cost of a second representation is higher than the risk of depending on `def`, which is also confined to one renderer module.
3. **A ready-made JSON Schema form library (react-jsonschema-form and the like).** Requires a Zod → JSON Schema conversion and brings its own renderer with its own widget and style system: a significant dependency, foreign UI on top of the panel's existing design system, and an override table is still needed. Rejected: it goes against the rule "no new dependency when the task is solved by existing means", and RHF + Zod are already in the stack.
4. **Keep raw JSON as the only way to edit nodes.** Nothing to build; the shared sections screen already exists. Rejected: AC-5 directly requires a form or a renderer for every type, and the "from scratch" scenario of AC-6 assumes field hints, without which only someone who already knows the format can assemble VLESS/Reality by hand in JSON.

## Decision outcome

The auto-generated form renderer is built by runtime introspection of the generated Zod schema:

- the renderer lives in a frontend slice (presumably `features/Config/NodeForm`) and walks the node schema through Zod's definitions API; all work with Zod internals is enclosed in one adapter module;
- the "schema kind → widget" mapping is a table, not an `if` chain; a kind the table does not know is rendered as a raw JSON subnode, it is neither lost nor crashes the form;
- the node type is picked from the variants of the registry's discriminated union; types outside the binary build are marked with a warning per ADR-0030 directly in the type picker;
- the form returns the whole node value, the write uses the existing `setValue`/`insertValue` by node path (ADR-0004); nodes with unknown fields stay with the text mode (ADR-0018);
- a hand-written form for a type is registered in the "type → component" table and replaces the auto-generated one; the AC-6 scenario (VLESS/Reality) is built with a hand-written form on top of the same write mechanism;
- field hints come from schema descriptions (the fork's godoc); no separate hint dictionary is created.

Non-goals: migrating the rule form to the renderer, an arbitrary JSON editor inside the form, generating forms for object sections (`log` and `experimental` are edited in the shared sections screen).

### Scope and boundaries

`apps/web/src`: the renderer slice and hand-written node forms; `apps/web/src/shared/api/generated.ts` is read but not changed. The daemon and the schema generator are not affected by the decision.

## Consequences

### Positive

- A new fork type gets a form by rebuilding the schema, without panel changes.
- One type model: the form cannot diverge from the schema because it reads that same schema.
- Hand-written forms and the auto-form live in one table; the extension mechanism matches the style guide's polymorphism rule.

### Negative

- Dependency on the representation of Zod definitions: a Zod major bump may require changes to the adapter module. The risk is localized but not zero.
- An auto-form from the schema is poorer than a hand-written one: without field grouping and ordering, long types read worse than in the fork reference. It matures through in-place overrides.
- The Zod schema arrives in the form chunk in full; bundle size is handled separately.

### Neutral or deferred

- The threshold after which a type deserves a hand-written form is decided by actual usage; this ADR does not fix it.
- Form validation stays with the same schema through the existing resolver; error highlighting before apply already works at the document level.

## Risks and mitigations

| Risk                                                              | Probability and impact                                      | Mitigation                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Zod's internal representation changes on an upgrade               | Low with 4.x pinned, medium impact: the renderer goes blind | Versions are pinned exactly; there is one adapter; the "every registry type gets a form" test fails at the first mismatch            |
| The auto-form builds a node that `sing-box check` rejects         | Medium probability for rare types, low impact               | The arbiter is check on apply (ADR-0002); the form does not replace it with its own validation                                       |
| A schema kind not covered by the table makes a field non-editable | Medium probability, low impact                              | The fallback widget is raw JSON of the subnode; a test walking all registry types counts the fields that went to the fallback widget |

## Compatibility, migration and rollback

Not applicable to data: the decision changes neither the config format nor the daemon contract. Existing hand-written forms keep working; the shared sections screen remains the fallback path. Rollback: remove the renderer slice; AC-5 then becomes open again.

## Validation

- Walk test: every variant of `InboundSchema`/`OutboundSchema` (and the other registries) produces a form without exceptions; the fields that went to the fallback raw widget are listed in a snapshot, so growth of the list shows in the diff.
- AC-6 scenario on the test bench: a VLESS/Reality config built with forms from scratch passes `make apply-check`.
- `pnpm --filter web build` and `pnpm lint` are green; no new dependencies in `apps/web/package.json`.

## Links

- [PRD](../PRD.md): AC-5, AC-6;
- [ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md): the three-layer config model.
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), [ADR-0018](./ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md), [ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md).
- `apps/web/src/shared/api/generated.ts`: the registries' discriminated unions; `apps/web/src/features/Rule/RuleEdit`: the existing hand-written form on RHF + Zod.
