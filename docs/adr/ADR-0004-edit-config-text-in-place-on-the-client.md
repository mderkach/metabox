# ADR-0004. Edit the config text in place on the client instead of rebuilding it from the parsed model

- Status: Accepted
- Date: 2026-09-10
- Deciders: repository owner

## Context and problem statement

The daemon takes the config as the body of `POST /api/apply` and writes it verbatim: parsing into structs or a map is forbidden, and the only structural edit is inserting `experimental.clash_api` ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)). So the text the interface sends is the future content of `/etc/sing-box/config.json`.

The requirements for this text are set by the [PRD](../PRD.md): AC-2: after editing one field, the diff against the original file contains only that field; AC-3: constructs not recognized by the model survive a round-trip. Both criteria belong to milestone M3, but they can be violated as early as milestone M1: the very first Apply from the interface rewrites the whole file.

At the moment the frontend gets the `GET /api/config` response through axios, that is, already parsed into an object, and checks it with the `ConfigSchema` schema (`apps/web/src/entities/Config/api/Config.query.ts`). The original text of the file is not kept anywhere.

Measurement on the target device's config (745 lines, 32 `route.rules` rules, 18 remote rule sets, a `providers` section), 2026-09-10:

- the schema accepts the config without remarks;
- no values are lost: after recursive key sorting the parsed object matches the original byte for byte, with no differences in values;
- key order is not kept: `providers` moves from the seventh top-level position to the fifth, and serializing back differs in **418 lines of 744**;
- the original file's formatting matches two-space `JSON.stringify`: the file text and `JSON.parse` → `JSON.stringify(…, null, 2)` differ in one line (the trailing newline).

The reordering comes from how Zod works: `safeParse` builds a new object, laying out known fields in the schema's order, not in the order of the input.

Step 2 of the ADR-0002 sequence, "serialization to `config.json`, on the frontend", is refined by this decision as to the method: the frontend produces the config bytes but gets them by editing the original text, not by serializing the model. The sequence itself and the split of steps between the frontend and the daemon do not change.

In scope: how the interface produces the body of `POST /api/apply`. Out of scope: the apply protocol, file ownership and the `clash_api` guarantee: they are set by ADR-0002 and do not change; storage of drafts (AC-26, milestone M3).

## Decision drivers

1. **AC-2 and AC-3 hold on an arbitrary config**, not only on a file formatted the same way a browser formats it.
2. **The mechanics of a targeted edit are not duplicated** between Go and TypeScript: two implementations of one format drift silently.
3. **The daemon contract is not extended without need**: every new endpoint has to be versioned, tested and replayed after an interruption.
4. **Code volume and maintenance**: how much to write and how much to fix later on JSON edge cases.
5. **Bundle contribution**: the frontend already ships all code as one chunk, 737 kB at the time of the decision.
6. **Testability**: the result is checked by a golden round-trip on a fixture, without a device.

## Considered options

1. **Edit the original text in place with the `jsonc-parser` library**: the frontend keeps the file text as is; an edit is addressed by a path (`['route','rules',5,'outbound']`), `modify` returns a list of edits, `applyEdits` builds the new text. The other bytes are not touched. The library is `microsoft/node-jsonc-parser` 3.3.1, it underlies the JSON editor in VS Code and has no dependencies. Pros: AC-2 and AC-3 hold regardless of the original file's formatting; JSON edge cases are already covered by someone else's tests; it supports insertion into an array (`isArrayInsertion`) and removal of an element, which the `route.rules` editor needs. Cons: a new dependency, 16.8 kB added to the bundle, 5.5 kB after gzip (measured 2026-09-10: a build with a stub instead of the library gave 736.85 kB, with the library 753.67 kB); a second data model appears on the client, the text next to the parsed object, and their consistency has to be kept explicitly. **Chosen.**

2. **A custom JSON text patcher in TypeScript**: the same scheme without the dependency. Pros: nothing extra in the bundle, full control. Cons: 200-300 lines with their own tests for escape sequences, Unicode, nested arrays and trailing commas, that is, repeating the work that already had to be done once in `internal/clashapi/splice.go` for one single insertion. The saving on driver 5 does not pay for the risk on drivers 4 and 6. **Rejected.**

3. **A patch endpoint on the daemon**: the interface sends a list of edits (path and value), and the daemon applies them to the config bytes with the `splice.go` mechanics. Pros: the targeted byte edit stays in one place and is already covered by tests (driver 2). Cons: extending the daemon contract (driver 3): a new request format, its validation, behaviour with a partially applicable patch; an extra network round trip before showing the diff, which the interface must render before sending; `splice.go` can currently insert one object member, not arbitrary paths with arrays, so the mechanics would have to be extended anyway. **Rejected**, but it stays a fallback if the client-side edit turns out to be unworkable.

4. **Rebuild the config from the parsed model**: serialize what Zod returned. Pros: nothing needs to be done. Cons: the measurement above, 418 lines of 744 differ on the very first apply, AC-2 is violated directly and on any config. **Rejected.**

5. **Restore the key order from the original object**: serialize the parsed model, but lay out the keys in the order they had in `JSON.parse` of the original response, appending new keys at the end. About 50 lines, no dependencies. Pros: cheap, closes milestone M1 on the target device's config. Cons: it depends on matching formatting: a file with tabs, four spaces or written on one line gets reformatted entirely, so AC-2 holds by chance, not by design; at milestone M3 (AC-1, importing other people's configs) a rework is unavoidable. **Rejected.**

## Decision outcome

The source of truth for the config document on the client is **the file text** received from `GET /api/config`. The structure parsed by the Zod model is used only for display, search and validation.

Mandatory implementation rules:

- the `GET /api/config` response is kept as a string; the object is parsed from this string, not instead of it;
- every edit of the document is expressed as a path plus a value and is applied to the text through `modify` and `applyEdits` from `jsonc-parser`;
- the body of `POST /api/apply` is the text produced by `applyEdits`. Serializing the parsed model into the request body is forbidden;
- the indentation and newline for inserted nodes are detected from the original text and passed in `formattingOptions`; the default is two spaces and `\n`;
- adding a rule to `route.rules` is done through `isArrayInsertion`, removal by editing the same path with the value `undefined`. Rebuilding the whole array is forbidden: it would rewrite all its elements;
- moving a rule is one store action: the node is read, removed from its old position and inserted at the new one. From the outside this is one operation, so indices do not shift under the calling code.

Non-goal: the client does not bring the config to a canonical form, does not sort keys and does not reformat what the user did not touch.

### Scope and boundaries

The decision covers `apps/web/src/entities/Config` (the document text, the store and edits) and `apps/web/src/shared/api` as to access to the raw response body. It does not affect the daemon and its contract: the body of `POST /api/apply` stays the config bytes.

## Consequences

### Positive

- The diff of an applied config contains only what the user edited, regardless of how the original file is formatted.
- Constructs the schema does not recognize do not go through serialization at all, so nothing can distort them (AC-3).
- The daemon contract stays the same: the interface sends bytes as before; only the way it gets them changes.
- The diff before apply is computed from two texts, not by comparing objects: the user sees exactly what will go to the device.

### Negative

- The client has two representations of one document: the text and the parsed model. After every edit the model has to be rebuilt from the new text, otherwise the screen and the file drift apart.
- An edit is addressed by a path, so every interface element must know the path of its node. For `route.rules` this is an array index, and reordering rules shifts the indices: the order of operations within one action becomes significant.
- A new dependency in a bundle that is already large.

### Neutral or deferred

- Storage of drafts (AC-26) is not affected: the decision only describes producing the Apply body.
- Option 3 (a patch on the daemon) stays open as a fallback if the client-side edit turns out to be unworkable on large configs.

## Risks and mitigations

| Risk                                                                | Likelihood and impact | Mitigation                                                                                                                                                         |
| ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The text and the parsed model drift apart after a series of edits   | Medium, high impact   | The model is rebuilt from the text after every edit; drift is caught by a golden round-trip test on a fixture                                                      |
| The file on the device is changed externally between read and apply | Low, high impact      | The daemon returns the `sha256` of the written config in the transaction (`apply.Transaction.Sum`); the interface compares it and rereads the config on a mismatch |
| `jsonc-parser` stops being maintained                               | Low, medium impact    | The API is narrow, `modify` and `applyEdits`; replacing it with option 2 or 3 is contained in one module                                                           |
| Editing `route.rules` indices on reordering hits the wrong node     | Medium, medium impact | A move is expressed as one operation on the array, not as a series of edits by index; covered by a test moving adjacent rules                                      |

## Compatibility, migration and rollback

No migration is needed: the interface does not write the config yet, so there is nothing to change. The file format on the device does not change; on the contrary, the decision exists so that it does not change beyond the user's edits.

Rollback is to go back to option 4 or 5 at the cost of AC-2; the changes are contained in the module that produces the Apply body.

## Validation

- Golden round-trip on the fixture `apps/web/src/entities/Config/__tests__/Config.fixture.ts`: apply one edit and make sure the text differs exactly in the affected lines, not in the whole file.
- A test for inserting, removing and moving a `route.rules` rule: the other rules stay unchanged byte for byte. A move is checked by the set of text lines: after it, the set must match the original.
- `pnpm --filter web test` and `pnpm lint`.
- Manual scenario on the test bench: `make up`, edit one rule in the interface, Apply, then `diff` of the file before and after: only the lines of that rule differ and, if the daemon added it, the `experimental.clash_api` section.

## Links

- [PRD](../PRD.md): AC-2, AC-3, AC-13, AC-26; [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md): the frontend stack;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): config ownership and the Apply protocol;
- `apps/web/src/entities/Config/api/Config.query.ts`: the current parsing of the response with the schema;
- `apps/metaboxd/internal/clashapi/splice.go`: targeted byte edit on the daemon side;
- [microsoft/node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser): `modify`, `applyEdits`, `ModificationOptions`.
