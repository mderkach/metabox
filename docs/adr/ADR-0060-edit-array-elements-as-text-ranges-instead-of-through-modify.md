# ADR-0060. Edit array elements as text ranges instead of through `modify`

- Status: Proposed
- Date: 2026-10-24
- Deciders: repository owner

## Context and problem statement

[ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md) makes the config text the source of truth and requires every edit to go through `modify` and `applyEdits` from `jsonc-parser` 3.3.1. For arrays it fixes the method: an element is added with `isArrayInsertion`, removed by writing `undefined` to its path, and a move is a removal plus an insertion of the value read from the old position.

`modify` formats the edited region extended to whole lines, so it rewrites more than the element. Measured on 2026-10-24 on `route.rules` with one-line rules (`apps/web/src/entities/Config/__tests__/corpus/handwritten.jsonc` and a list without a trailing comma):

- an insertion expands the previous element into several lines if it was written on one line; an append does the same with the last element;
- in a list with a comma before the closing bracket, removing a rule expands the next one: rules 0, 1, 3 and 4 of `handwritten.jsonc` give two to five new lines each;
- a move inserts the value, not the text: a one-line rule becomes multi-line, and comments inside and above it are lost.

AC-2 of the [PRD](../PRD.md) requires the diff after an edit to contain only the edited node. In scope: insertion, removal and moving of array elements in `apps/web/src/entities/Config/model`. Out of scope: object members, field writes (`setValue`), the apply protocol.

## Decision drivers

1. AC-2 and AC-3 hold for arrays written by hand: one-line elements, comments, a trailing comma.
2. No new dependency (ADR-0004 driver 5).
3. The public store API (`insert`, `remove`, `move`) does not change.
4. The amount of own text-handling code stays small and is covered by tests.

## Considered options

1. **Compute array edits from `parseTree` offsets and the `jsonc-parser` scanner, apply them with `applyEdits`**: the element range comes from the parsed tree, the comments and the comma around it from scanning the gap between two elements, which holds only trivia. A move carries the source text of the element. Pros: the neighbours keep their bytes; comments move with the element; parsing, string escapes and the edit application stay in the library. Cons: about 250 lines of own code that decides which comment belongs to which element. **Chosen.**
2. **Keep `modify` and reformat its result back**: format only the element range with `format`. `modify` has already joined the neighbour's lines into its edit, and there is nothing in its result to tell which lines were one line before. **Rejected.**
3. **Keep the current approach**: the defect stays; the diff before Apply shows lines the user did not edit, and a moved rule silently loses its comments. **Rejected.**
4. **A custom JSON patcher** (ADR-0004 option 2): repeats the parsing the library already does. **Rejected.**

## Decision outcome

Array elements are edited by `apps/web/src/entities/Config/model/Config.array.ts`:

- an element owns its value, comments on their own lines above it, and after it the comma and comments on the comma line; a comment on the line of the opening bracket and a comment on its own line after the last element belong to no element and stay in place;
- removal deletes that range up to the next element; removing the last one also deletes the comma of the previous element, unless the list keeps a comma before the closing bracket;
- insertion writes the new element at the position of the element it pushes forward, with the line break and indent the list already uses; in a list written on one line the value goes on one line;
- a move removes the range and inserts the same text at the new position: comments and one-line or multi-line layout are kept;
- every range edit is checked: the list in the new text must hold exactly the expected values, with no new syntax errors. If not, insertion and removal fall back to `modify`, and a move to removal and insertion of the value;
- `modify` stays for what has no neighbours: an empty or absent list, removing the only element, object members and field writes.

Mandatory rule replacing the array part of ADR-0004: inserting, removing and moving an array element must not change the bytes of other elements, except the comma of the element that becomes the last one or stops being it.

## Consequences

### Positive

- The diff before Apply shows only the edited rule; a moved rule keeps its comments.
- The store API and its callers do not change.

### Negative

- Own code decides comment ownership; an unusual layout (a comment between a value and a comma on another line) follows the rule above, which may not match the author's intent.
- A layout the rule cannot keep (several elements on one line followed by a line comment) falls back to `modify` and reformats as before; a moved element then loses its comments, but not its data.
- Each array edit parses the text twice more for the check.
- Two mechanisms edit the document: range edits for array elements, `modify` for everything else.

### Neutral or deferred

- Removing an object member through `modify` may reformat neighbouring members the same way; no case has been reported, and it is not covered here.

## Compatibility, migration and rollback

Not applicable for data: the file format does not change, only which bytes an edit touches. Rollback is reverting `Config.array.ts` and its call sites in `Config.model.ts`.

## Validation

- `apps/web/src/entities/Config/__tests__/Config.store.test.ts`, "array edits on one-line rules": a move changes only the moved range and keeps the comment, append and removal keep neighbouring one-line elements on one line, a trailing comma and a one-line list keep their layout, comments above the first element and before the closing bracket keep their owner, a layout that cannot be kept falls back without losing data.
- `pnpm --filter web test`, `pnpm lint`, `pnpm format:check`.

## Links

- [PRD](../PRD.md): AC-2, AC-3;
- [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md): editing the config text in place;
- `apps/web/src/entities/Config/model/Config.array.ts`, `apps/web/src/entities/Config/model/Config.model.ts`;
- [microsoft/node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser): `parseTree`, `createScanner`, `applyEdits`.
