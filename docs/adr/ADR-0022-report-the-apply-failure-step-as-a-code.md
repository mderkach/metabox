# ADR-0022. Report the step where Apply stopped as a code, not only as text

- Status: Accepted
- Date: 2026-09-16
- Deciders: repository owner

## Context and problem statement

The apply cycle reported its failure as one line: `Transaction.Reason` was filled with the error text assembled by wrappers on the way up — "запись конфига: временный файл в /etc/sing-box: no space left on device" ("config write: temporary file in /etc/sing-box: no space left on device"). The panel showed this line as is.

Two consequences follow. First: text in the daemon's language reaches the user untouched, and in the English interface it stays Russian — exactly what [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md) closed for HTTP rejections by giving the panel a code. Second: the panel cannot tell "the config was not written" from "the service did not restart" — for it these are the same kind of string, and it cannot offer different things even when it wants to.

The line itself is still needed: it holds the original error of the step, and it is what gets used to fix the failure. It cannot be thrown away, just as the `sing-box check` output cannot be thrown away (ADR-0002).

In scope: how a cycle failure reaches the panel. Out of scope: the set of protocol steps: ADR-0002 defines it and it does not change here.

## Decision drivers

- The panel can show the cause in the user's language.
- The step detail is not lost: it is used to fix the failure.
- The failure code is tied to a protocol step, not to the error text: comparing errors by text is forbidden by the daemon rules.
- An unknown code does not leave the user without an explanation.
- The state on disk stays readable by the previous daemon version: the file survives a device reboot.

## Considered options

1. **Step code next to the text** — `Transaction` gets `ReasonCode`, steps wrap their error in the `StepError` type, the panel takes the text by code and shows the original error as detail. Pros: the cause is translated; the text is kept; the code is set by whoever knows the step. Cons: the transaction has two fields about one failure, and they have to be kept consistent. **Chosen.**

2. **Parse the text on the panel side** — look for "запись конфига" ("config write") and the like in the string. Cons: the text is a message to the user, not a contract; the daemon rules forbid this explicitly, and any wording change would break the panel silently. **Rejected.**

3. **Replace the text with a code entirely** — keep only `ReasonCode`. Pros: one field, no desync. Cons: the original step error disappears, and with it the only hint of why exactly the write failed. **Rejected.**

4. **Keep the current approach** — text only. Cons: does not meet the goal — the cause stays untranslatable. **Rejected.**

## Decision outcome

Cycle steps wrap their error in `apply.StepError` with the step code:

```go
return stepFailed(ReasonWriteFailed, fmt.Errorf("запись конфига: %w", err))
```

The code set is closed and declared in `internal/apply` next to the transaction: `backup_failed`, `write_failed`, `restart_failed`, `healthcheck_failed`, `rollback_failed`. `Transaction` carries both fields: `ReasonCode` is the step, `Reason` is the original error. An error without a code leaves `ReasonCode` empty: this is a failure the cycle did not expect, and naming a step in that case would be a lie.

The panel takes the text by code from its slice dictionary and shows the original error under it, the same way it shows the `sing-box check` output. The code table is typed with the set from the contract ([ADR-0021](./ADR-0021-print-contract-enumerations-as-value-lists.md)), so a new step in the daemon is a panel compile error.

### Scope and boundaries

`apps/metaboxd/internal/apply` and the `features/Config/ConfigApply` slice in the panel. The Apply protocol, its phases and the state file do not change otherwise.

## Consequences

### Positive

- The failure cause reads in the user's language, and the detail stays for whoever fixes it.
- The panel learned to tell steps apart: `rollback_failed` is the worst result, and it is now visible separately from "apply did not go through".
- The code is set by whoever knows the step, not by whoever reads the string.

### Negative

- The transaction has two fields about one failure. They can diverge only through `release`, and that is the only place where they are filled together.
- The code set repeats the protocol steps: a new step has to be added in two places — in the cycle and in the panel dictionary. The second is caught by the compiler.

### Neutral or deferred

- The same technique closes the `unknown` reason in route explanation: `route.ReasonCode` with the single value `not_in_process_list`. The last places where daemon prose reaches the screen are the `sing-box check` output and the service log, and they are not translated per ADR-0002.

## Risks and mitigations

| Risk                                                             | Likelihood and impact             | Mitigation                                                                                      |
| ---------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| A step wraps the error and loses the code in a higher wrapper    | medium; cause without translation | `reasonOf` looks up the code via `errors.AsType`, a `%w` wrapper keeps the chain                |
| A new step is added to the cycle but not to the panel dictionary | medium; text without translation  | the table is typed with the set from the contract — the panel build fails                       |
| Old state on disk without `reason_code`                          | high on upgrade; low impact       | the field is optional: the transaction is read, the code is empty, the text comes from `Reason` |

## Compatibility, migration and rollback

`reason_code` is a new optional field. A state file written by the previous version is read as before; a panel without support for the field ignores it. The reverse order — new file, old daemon — is also safe: Go parsing skips an unknown field.

Rollback: make `release` return the string again: the field stays empty in the contract.

## Validation

- `cd apps/metaboxd && go test ./internal/apply/` — a write failure gives `write_failed`, a healthcheck failure gives `healthcheck_failed`, and the step detail is not lost;
- `make schema-daemon` — `REASON_CODE` in the panel contract;
- `pnpm --filter web build` — the text table covers the whole set, otherwise the build fails.

## Links

- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) — the Apply protocol and its steps;
- [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md) — the panel chooses the text, the daemon gives the code;
- [ADR-0021](./ADR-0021-print-contract-enumerations-as-value-lists.md) — the code set reaches the panel through the contract;
- [Errors and logging](../../apps/metaboxd/docs/guides/ErrorsAndLogging.md) — comparing errors by text is forbidden;
- [`apps/metaboxd/internal/apply/apply.go`](../../apps/metaboxd/internal/apply/apply.go).
