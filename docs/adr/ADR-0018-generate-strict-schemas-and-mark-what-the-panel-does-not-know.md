# ADR-0018. Generate strict schemas and mark what the panel does not know

- Status: Accepted
- Date: 2026-09-15
- Deciders: repository owner

## Context and problem statement

The generator printed `z.looseObject`: parsing silently skipped a field the schema did not have and declared the node valid. The effect was checked on the test bench on 2026-09-15 with a config holding the rule `{"unknown_matcher": ["своё условие"], "outbound": "direct"}`:

- `RuleSchema.safeParse` reported success, `isRuleRecognized` said "node recognized";
- the parsed node had no conditions left, and the list wrote "no conditions — applies to all traffic";
- the edit panel opened the form and offered to edit a node it half did not understand.

So the panel stated something plainly wrong about the owner's rule: a rule with a condition was shown as unconditional, cutting off the rest of the list. The bytes did not suffer — edits hold on to the file text — but such a screen cannot be read.

The requirements are split: unknown constructs must survive a round-trip **and** be marked in the UI as unrecognized. The first worked, the second did not.

In scope: what the schema does with a field it does not know, and how this reaches the screen. Out of scope: validity of values; `sing-box check` on the device stays the arbiter.

Constraint: the schema is built from the release build of the fork ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)) and knows less than the binary by design — it lacks fields of types built under other tags.

## Decision drivers

- A node the schema does not know is shown to the user as unrecognized, not as empty.
- An unknown field blocks neither saving nor applying the config: the binary is the arbiter.
- One unknown key does not blank out screens: the config model keeps being built.
- The schema stays a generator artifact and needs no manual edits.
- The behaviour is covered by tests without a device.

## Considered options

1. **Strict schemas plus issue analysis** — the generator prints `z.strictObject`, and the panel tells an "extra field" from a real error and marks the node. Pros: the panel honestly says what it does not know; byte preservation is untouched; no manual schema edits. Cons: issue analysis is not obvious — a union hides the cause inside its branches, and it has to be unwrapped. **Chosen.**

2. **Keep `looseObject`, check keys against a separate list** — the generator also prints a set of known keys per type, the adapter compares it with the actual ones. Pros: schema behaviour does not change. Cons: a second generator artifact about the same thing, two sources of truth about a type's fields and a duty to keep them in sync. **Rejected.**

3. **Strict schemas without leniency** — a node with an unknown field is a config error, the model is not built. Pros: simplest. Cons: one key from a build with other tags blanks out forms and tabs entirely, although the binary accepts such a config. **Rejected.**

4. **Keep the current approach** — consider unknown fields not worth marking. Cons: the panel keeps lying about the owner's rules. **Rejected.**

## Decision outcome

The generator prints `z.strictObject`. A field missing from the schema is a parse issue, not silence.

The panel analyses the issues and splits them in two (`shared/lib/schemaIssues.ts`):

- issues only about extra fields — the node is intact, the panel just does not know it. The config model is built, the nodes and their fields are listed in `ParsedConfig.unknown`;
- any other issue is a real error: the model is not built, the issues are shown as is.

The union is unwrapped: a rule is described by variants, and an extra key arrives not as a key rejection but as `invalid_union` with the issues of every branch. A node counts as merely unknown if at least one branch was blocked only by extra fields.

On screen it looks like this: the list row gets the mark "UI does not cover" and the caption "conditions not shown — the schema does not know this rule" instead of "no conditions"; the edit panel disables the form and opens the node as text. Such a node can still be written — through `sing-box check` on the device.

## Consequences

### Positive

- The panel no longer passes off a rule with an unknown condition as unconditional.
- A mismatch between the schema and the binary became visible on screen, not only in behaviour.
- The `Config` type no longer carries an index signature: code that reads an unknown section from the model no longer compiles silently.

### Negative

- Analysis of Zod issues became part of the panel: the shape of `invalid_union` is a library detail, and a change to it breaks the marks. Covered by tests on the corpus.
- An unknown field in any config node moves parsing to the slow path: first the strict check, then a walk over the issues.
- Casting the value to `Config` on this path is an assertion, not a check: it relies on all issues having been about extra fields only.

### Neutral or deferred

- The mark lives on the rules screen. Other sections have no screens yet, and there unknown fields are visible only in `ParsedConfig.unknown`.

## Risks and mitigations

| Risk                                                                     | Likelihood and impact                                     | Mitigation                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The schema lags behind the fork, and working nodes get marked en masse   | medium on a version bump, medium — noise on screen        | the mark does not block editing or applying; the config corpus catches regressions on forms from the field        |
| Zod changes the shape of union issues, and the marks stop being gathered | low, high — nodes again pass themselves off as recognized | the version is pinned exactly, the analysis is covered by tests on the corpus and on a rule with an unknown field |

## Compatibility, migration and rollback

The config format does not change, no migration is needed. Configs without unknown fields behave as before.

Rollback: return `z.looseObject` in the generator's `writeObject` and regenerate the schema: the panel again counts such nodes as recognized, and the marks disappear with them.

## Validation

- `make schema` and `make test-schemagen` — the schema is rebuilt, the generator tests pass.
- `pnpm --filter web test` — corpus: a config with unknown sections, fields and a condition is parsed, the model is built, `unknown` names `vendor_extension`, `unknown_option` and `unknown_matcher` with paths; the schema accepts the other corpus files entirely.
- Run on the test bench on 2026-09-15: the rule `{"unknown_matcher": [...]}` is marked "UI does not cover" in the list and captioned "conditions not shown", the form is disabled in the edit panel, the node is opened as text and is intact.

## Links

- [PRD, AC-3 and AC-25](../PRD.md);
- [ADR-0001. Generate the schema from the fork registries](./ADR-0001-generate-schema-from-fork-registries.md);
- [ADR-0004. Edit the config text in place on the client](./ADR-0004-edit-config-text-in-place-on-the-client.md);
- `tools/schemagen/schema.go`, `apps/web/src/shared/lib/schemaIssues.ts`, `apps/web/src/entities/Config/api/Config.query.ts`.
