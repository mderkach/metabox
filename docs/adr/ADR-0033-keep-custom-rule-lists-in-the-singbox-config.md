# ADR-0033. Keep custom routing lists in the sing-box config, not in the daemon state

- Status: Accepted
- Date: 2026-09-25
- Deciders: repository owner

## Context and problem statement

AC-8 requires that the user can build a custom list of domains and addresses in the panel, including one based on a provider list, and that a route refers to it as a rule set. Open question OQ-3 in section 10.1 of the [PRD](../PRD.md) is where such a list physically lives: in the config itself, as a separate file next to it, or in the daemon state. While it is open, AC-8 cannot start, and milestone M2 does not close without it.

Constraints are already set by other decisions and by the code:

- **The config is the single source of truth about routing.** The daemon owns the file but must read an arbitrary `config.json`, and unrecognized content in it is not lost ([ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md)). For the same reason OQ-11 recommends not adding a rule disable toggle: its state would live outside the file.
- **The service starts in directory mode** — `sing-box -D /etc/sing-box -C /etc/sing-box run` — and merges all files of the directory with the `.json` suffix ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)). Subdirectories are skipped during the merge: `readConfig` in `cmd/sing-box/cmd_run.go` of the fork `v1.14.0-extended-2.7.1` takes only top-level entries.
- **Only the Apply protocol may write the config**: a `sing-box check -C` check on the candidate directory, atomic write, restart, healthcheck, a confirmation window with automatic rollback ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)). Version history stores the whole document ([ADR-0008](./ADR-0008-store-config-versions-as-numbered-copies.md)).

What the fork can do — checked against the `v1.14.0-extended-2.7.1` sources:

- `route.rule_set` accepts the `inline` type — the rules sit right in the node (`option/rule_set.go`, the default type when `type` is empty).
- `local` reads a file by `path` in both formats: `source` — JSON, `binary` — `.srs` (`route/rule/rule_set_local.go`). Compiling to `.srs` is not required for `local`.
- A relative `path` is resolved from the service working directory (`filemanager.BasePath`, the `-D` directory).
- `local` watches its file (`fswatch`) and re-reads it on the fly. A changed file changes routing without a check, a restart or a confirmation window.

In scope: where the list is stored and who writes it. Out of scope: the list editor interface, importing a provider list and the exchange format with the panel.

## Decision drivers

- The config stays the single source of truth: the files on the device show everything that affects the route.
- The list goes the same way as the config: check, write, rollback, version history.
- A version rollback does not split the config and the list apart.
- The panel without the daemon or after its removal does not leave the router with a route that cannot be read from the files.
- The config size stays acceptable for text editing and an on-screen diff.

## Considered options

1. **The list inside the config, an `inline` rule set** — the rules sit in the `route.rule_set` node of the config itself. Everything in one file: the list gets check, write, version history and rollback for free, because the Apply protocol already works with the whole document. Drawback — size: a provider list of thousands of entries bloats the config, the text mode and the diff. **Chosen for small lists.**
2. **A separate file next to the config, a `local` rule set** — the source in the `source` format lives in a subdirectory of the config directory, the node refers to it with a relative `path`. The config stays compact, the file is readable and editable by hand. The price: the Apply protocol stops being single-file: the list file is checked, written, enters history and is rolled back in one transaction with the config. Besides, the file cannot be written outside the transaction: the fork re-reads it by itself. **Chosen for large lists.**
3. **The source in the daemon state** (`<state-dir>`) — the daemon keeps the list itself, builds `.srs` and hands it to sing-box. The panel fully controls the format. But part of the truth about routing leaves the config file: `config.json` does not show where the rule set came from, and a manual config edit or removing the panel breaks the route in non-obvious ways. This contradicts [ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md) — the same reason the toggle from OQ-11 is not recommended. **Rejected.**

## Decision outcome

A custom list is stored in the sing-box config — in the file itself or next to it — and is written only by the Apply protocol.

- A small list is a `route.rule_set` node with `type: inline` in the config itself.
- A large list is a `type: local` node with `format: source` and a relative `path` into a subdirectory of the config directory, for example `rule-sets/<tag>.json`. The list file is not put into the directory root: the service would merge it with the config as one more `.json`.
- The list file is part of the Apply transaction. The candidate is checked by `sing-box check` together with the list files at the same relative paths. The write is atomic, in version history the file is stored next to the config of the same version, a rollback returns both.
- The list file is not written outside the transaction: the fork re-reads it by itself, and such an edit would bypass the check and automatic rollback.
- The daemon state does not store the list. A draft before apply lives in the same place as the config draft — in the panel.

Non-goals: compiling to `.srs` on the device — `local` reads the source. The decision does not fix a specific threshold between a "small" and a "large" list.

### Scope and boundaries

`route.rule_set` of the config, the lists subdirectory in the config directory, the Apply protocol and the daemon version history (`apps/metaboxd/internal/apply`, `internal/config`).

## Consequences

### Positive

- The files in `/etc/sing-box` show everything that affects the route; after the panel is removed the config keeps working as is.
- A small list needs no change in the daemon: Apply already works with the whole document.
- No compilation is needed — the device does not run `sing-box rule-set compile` and does not keep `.srs` next to the source.

### Negative

- The Apply protocol and the version history, designed for one file, will have to be extended to a set of files: a check on the candidate directory, atomic write of several files and rollback. This is separate work in the daemon, and until it is done large lists are not supported.
- Two ways of storing a list coexist in one config, and the panel chooses between them by size.
- A hand-written `local` that the user put in place and that does not follow the rules above can be shown by the panel, but the panel is not obliged to manage it.

### Neutral or deferred

- The threshold between `inline` and a file is determined when implementing AC-8 by measurement: config size, parse time, diff volume.
- The wording of AC-8 is aligned with the decision in PRD 1.31: there is no compilation to `.srs` on the device, `local` reads `source`.

## Risks and mitigations

| Risk                                                                                                  | Likelihood and impact                                                             | Mitigation                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A rollback returns the config but not the list file                                                   | Medium likelihood with a multi-file transaction, high impact — the route diverges | A version stores the config and list files together; an integration rollback test checks both                                                 |
| An edit of the list file outside Apply takes effect at once, without a check or a confirmation window | Low likelihood, high impact                                                       | The daemon writes the file only inside a transaction; a manual edit on the device is a deliberate bypass, like a manual edit of `config.json` |
| A list file accidentally lands in the directory root and merges with the config                       | Low likelihood, medium impact — `check` rejects                                   | The panel builds the path, files go only into the subdirectory; `check` on the candidate directory catches the merge before the write         |

## Compatibility, migration and rollback

Not applicable to existing configs: the panel has not created custom lists yet, there is nothing to migrate. Hand-written `inline` and `local` in someone else's config are read under the general rule of AC-3 and AC-25 and kept as is. Abandoning the decision before AC-8 is implemented rolls nothing back.

## Validation

- A panel test: a new small list goes into the draft as a `type: inline` node, the diff shows only it.
- Daemon integration tests (`make test`, `internal/apply`): a candidate with a list file is checked by `check -C` together with the file; an error before `rename` changes neither the config nor the list; a version rollback returns the config and the list byte for byte.
- `make apply-check` on the test bench: a config with a `local` rule set from a subdirectory passes the Apply cycle and automatic rollback.
- A search through the daemon code: no list files appear in `<state-dir>`.

## Links

- [PRD](../PRD.md): AC-8, OQ-3 and OQ-11 in section 10.1, appendix A.5; [ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md) — the config model.
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) — the Apply protocol and directory mode.
- [ADR-0008](./ADR-0008-store-config-versions-as-numbered-copies.md) — config version history.
- Fork `sing-box-extended` `v1.14.0-extended-2.7.1`: `option/rule_set.go`, `route/rule/rule_set_local.go`, `cmd/sing-box/cmd_run.go`.
