# ADR-0017. Read the config in the same dialect the binary accepts, not as strict JSON

- Status: Accepted
- Date: 2026-09-15
- Deciders: repository owner

## Context and problem statement

`config.json` on the router is written by hand. Checked on the test bench on 2026-09-14 (`sing-box 1.14.0-extended-2.7.1`): the binary accepts `//` line comments, `/* */` block comments and a comma before a closing bracket; all five variants passed `sing-box check`.

The daemon and the panel read such a file as strict JSON and diverged from the binary in both directions:

- `clashapi.Ensure` starts with `json.Valid`, so `POST /api/apply` answered `internal`, and the log was left with "clash_api guarantee: the config is not valid JSON". The owner saw an "internal error" on a file their router is running right now;
- `clashapi.Read` used the same `encoding/json` to get the Clash API address and secret: on a config with comments the healthcheck would be left without an address;
- the text editing screen checked the input with `JSON.parse` and showed a parse error on a working config, even though the rule list next to it was read and displayed: it goes through `jsonc-parser` ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md)).

In scope: reading and targeted editing of the config by the daemon and checking the text in the panel. Out of scope: validation of values: `sing-box check` on the device stays the arbiter, not parsing on the panel side.

A constraint is set in advance: the daemon's root module has no dependencies (`apps/metaboxd/AGENTS.md`), and a new one is a separate decision. The second constraint comes from [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) and [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md): the config is edited by bytes, because parsing into a structure and serializing back would reorder keys and lose the owner's formatting.

## Decision drivers

- The daemon accepts exactly what the binary accepts: a mismatch turns into a refusal to apply a working config.
- The targeted edit is preserved: bytes outside the edit stay the same, including comments.
- The daemon gains no dependencies.
- The behaviour is covered by tests without a device.
- The panel and the daemon speak about the same file in the same way.

## Considered options

1. **Mask the extras with spaces before parsing**: comments and trailing commas are replaced with spaces in a copy, the length is kept, so offsets found by parsing the copy point to the same bytes of the original; the edit goes on the original. Pros: the standard library stays, the targeted edit works unchanged, the behaviour is checked by unit tests. Cons: our own scanner of strings and comments, which has to be kept consistent with the binary's dialect. **Chosen.**

2. **Take a ready-made JSONC parser into the daemon**, for example `tailscale/hujson` or similar. Pros: someone else's parsing instead of our own. Cons: the first dependency of the root module for one function; preserving offsets would still have to be checked on our own, and without it the targeted edit breaks. **Rejected.**

3. **Stop parsing the config in the daemon**: search for `experimental.clash_api` in the text without parsing. Pros: the dialect stops mattering. Cons: finding brackets with regular expressions in someone else's file is unreliable exactly where the cost of an error is high: the daemon adds a section to a working config. **Rejected.**

4. **Keep the current approach**: treat comments in the config as unsupported. Cons: a handwritten config from the router is not applied, and the failure message does not explain the reason. Directly contradicts AC-1. **Rejected.**

## Decision outcome

The daemon and the panel read the config in the binary's dialect: comments of both kinds and a comma before `}` or `]` are not an error.

In the daemon (`apps/metaboxd/internal/clashapi/jsonc.go`) parsing goes over a masked copy, and editing over the original bytes:

- `mask` returns a copy of the same length where comments and trailing commas are replaced with spaces; newlines are kept so that line numbers in parse errors stay correct;
- the content of string literals is not touched: `//` and a comma inside a string are ordinary characters;
- there are two passes, because a comma before a comment becomes trailing only after the comment has been blanked;
- `json.Valid`, `objectStart` and `findMember` work on the copy, `insertMember` and `replaceSpan` on the original.

In the panel (`apps/web/src/widgets/Config/ConfigRawEditor`) the text is checked with `parse` from `jsonc-parser` with `allowTrailingComma`, not with `JSON.parse`. Error codes are translated into Russian phrases: the English `CloseBraceExpected` fixes nothing for a router owner.

Neither the daemon nor the panel gets new dependencies: `jsonc-parser` is already installed for parsing the config.

## Consequences

### Positive

- A handwritten config with comments is applied through the panel, and the comments stay in the file on the device.
- The daemon stopped answering with an "internal error" on a file the binary considers valid.
- The panel and the daemon give the same answer to the question "does this parse or not".

### Negative

- The daemon got its own dialect scanner. It is simpler than a full parser, but it diverges from the binary silently: if the fork starts accepting something else (single quotes, unquoted keys), the daemon starts rejecting a working config again.
- The mask doubles the config in memory for the duration of parsing. At the 1 MB ceiling this is unnoticeable, but it is the price of preserving offsets.

### Neutral or deferred

- There is no automatic check of the dialect against the binary: the set of checked constructs is fixed by tests and a run on the test bench, not derived from the fork's sources.

## Risks and mitigations

| Risk                                                                     | Likelihood and impact                               | Mitigation                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The fork extends the dialect, and the daemon starts rejecting the config | medium on a version bump, high: Apply does not pass | on a fork bump, run `sing-box check` on the set of constructs from the `jsonc_test.go` tests and extend the mask             |
| The mask eats a significant byte and corrupts the edit                   | low, high: a broken file goes into the config       | string length and content are covered by tests; `sing-box check` stays the arbiter, and on failure the config is not written |

## Compatibility, migration and rollback

No migration is needed: the file format does not change, and strictly more is read than before. Configs without comments behave as before: the `internal/clashapi` tests for them did not change.

Rollback is to restore `json.Valid(data)` and navigation over `data` in `Ensure`, `json.Unmarshal(data)` in `Read` and `JSON.parse` in the editor. Files on devices are not harmed by the rollback, but configs with comments stop being applied again.

## Validation

- `cd apps/metaboxd && go test ./internal/clashapi/...`: the mask keeps length, strings and newlines; `Ensure` finds the section behind comments and adds a missing one; `Read` gets the address and secret from a config with comments and a trailing comma.
- `pnpm --filter web test -- ConfigRawEditor`: the editor accepts comments and a trailing comma, and on an unclosed bracket names the line and the reason in Russian.
- Run on the test bench on 2026-09-15: a 509-line config with comments and 300 rules was applied through `POST /api/apply` and confirmed, and the comments are in place in `GET /api/config`; the same config without `experimental`: the section was added, the comments are intact.

## Links

- [PRD, AC-1 and AC-2](../PRD.md);
- [ADR-0002. Apply protocol and config ownership](./ADR-0002-apply-protocol-and-config-ownership.md);
- [ADR-0004. Edit the config text in place on the client](./ADR-0004-edit-config-text-in-place-on-the-client.md);
- `apps/metaboxd/internal/clashapi/jsonc.go`, `apps/metaboxd/internal/clashapi/clashapi.go`;
- `apps/web/src/widgets/Config/ConfigRawEditor/lib/ConfigRawEditor.lib.ts`.
