# ADR-0070. Name route rules with a line comment above the rule

- Status: Proposed
- Date: 2026-10-30
- Deciders: repository owner

## Context and problem statement

DNS servers, outbounds and inbounds are shown by their `tag`, but a `route.rules` entry has no identifier: the rules list, the rule panel and the Apply summary called it by its position ("Rule 3 changed"). The position says nothing about the rule and changes on every reorder, so the Apply summary of a reordered list reads as a set of unrelated numbers.

The fork has no `tag` or `name` field on a rule (`option/rule.go`, `RawDefaultRule`, `RawLogicalRule`), and `sing-box check` rejects unknown fields, so a name cannot live inside the rule object. The panel edits the config as text in place and keeps comments, key order and trailing commas ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), [ADR-0017](./ADR-0017-read-the-config-in-the-dialect-the-binary-accepts.md)); array moves and deletions already carry the comments on the line above an element with it (`entities/Config/model/Config.array.ts`).

The owner decided on 2026-10-27 (issue #137) where the name lives; this record keeps the reasoning and the parsing rules.

## Decision drivers

- `sing-box check` must accept the config: no new fields in the rule.
- The name must survive edits, reorder and deletion of neighbours, and the golden round trip.
- The name must be readable and editable in the text editor and on the device without the panel.
- No storage outside `config.json`: the panel has no database, and a side file drifts from the config edited by hand.

## Considered options

1. **A line comment directly above the rule object**: `// TV through VPN` on its own line right before `{`. Lives in the file, travels with the rule in the existing move and remove code, is visible and editable by hand, invisible to sing-box. The drawback: an existing comment above a rule (a note, commented-out code) is read as its name. **Chosen** by the owner.
2. **A field inside the rule** (`"name": "…"`): the simplest to parse, but the fork rejects unknown fields; it would need a fork change and would break every other sing-box build reading the config. **Rejected.**
3. **A side map in the daemon state, keyed by rule content or position**: no change to the config, but the key breaks on any edit or reorder made by hand, and the names do not travel with a copied config. **Rejected.**
4. **Keep numbers only**: no work, but the Apply summary and the list stay unreadable after a reorder. **Rejected.**

## Decision outcome

A rule name is the last line comment between the previous element and the rule object, separated from the object only by a line break and indents (no blank line). Everything after `//` with edge spaces trimmed is the name; an empty `//` is no name. A block comment is never a name. A comment at the end of the previous rule's line belongs to that rule, as in the array move code, and is not a name of the next one.

- Reading: `readRuleNames(text)` in `entities/Config`, one entry per `readRules` node; `toRuleRowsFromNodes(nodes, names)` puts it into `RuleRow.name`.
- Writing: `nameValue(text, path, name)` and the store action `rename`. A new name is inserted as its own line in the rule's indent; an existing one is replaced token for token; an empty name removes the whole comment line. A name is written on one line: inner whitespace runs collapse to one space. In a list written on one line the rule moves to its own line under the comment, one indent deeper. The edit is refused when the parsed document would change or the name would not read back.
- The rule form has a "Name" field; it is not held back like an emptied condition, since a comment line has no key order to keep.
- Without a name the label is derived from content: a known source device by its device label, otherwise the first condition in a fixed order (rule set, domain suffix, domain, …), with "+N" for further values, then `→` and the outbound or action. A rule without conditions is "all traffic → …". A rule whose fields the panel does not know and that shows no conditions keeps "Rule N". The number is secondary everywhere: the list row's accessible name, the panel subtitle, the Apply summary.
- The version history dialog lists versions, not rules, and is not changed.

### Scope and boundaries

`apps/web` only: `entities/Config` (comment read and write), `entities/Rule` (row name, derived caption, `useRuleTitle`), `features/Rule/RuleEdit`, `features/Config/ConfigApply`, `widgets/Rule/*`. The daemon and the config format are unchanged.

## Consequences

### Positive

- Rules are called the same way in the list, the panel and the Apply summary, and a reorder no longer renames them.
- The name is plain JSONC: visible on the device, editable by hand, kept by every tool that keeps comments.

### Negative

- A note or commented-out code right above a rule becomes its name. The user sees it in the list and can clear it or add a blank line.
- A tool that strips comments (a JSON formatter, `sing-box format`) drops the names.
- Naming a rule in a list written on one line reformats that one rule onto its own line.
- Rows are built from a second parse of the text (`readRuleNames`) on every draft change.

### Neutral or deferred

- Names for DNS rules and other comment-addressed lists can reuse `nameElement`; not done here.
- A rename alone is not reported in the Apply summary and does not mark the row as changed: both compare rule nodes, and the node did not change. The text diff shows the comment line.

## Compatibility, migration and rollback

Not applicable beyond reading: existing configs need no migration, and comments already above rules start showing as names. Rollback is removing the reading code; the comments stay valid JSONC.

## Validation

- `pnpm --filter web test -- entities/Config`: the corpus file `named-rules.jsonc` covers what counts as a name, and every corpus file is named and unnamed without changing the parsed document or the other names; `Config.model.test.ts` covers insert, replace, remove, one-line lists, CRLF, refusals and that a name moves and is deleted with its rule.
- `pnpm --filter web test -- Rule ConfigApply Editor`: derived labels, the form field and the Apply summary labels.
- Manual: name a rule in the panel, reorder it, open the text editor and the Apply summary.

## Links

- PRD: AC-2, AC-86.
- [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), [ADR-0017](./ADR-0017-read-the-config-in-the-dialect-the-binary-accepts.md).
- `apps/web/src/entities/Config/model/Config.array.ts`, `apps/web/src/entities/Rule/model/Rule.caption.ts`, `apps/web/src/entities/Rule/ui/useRuleTitle.ts`.
- Issue: mderkach/metabox#137.
