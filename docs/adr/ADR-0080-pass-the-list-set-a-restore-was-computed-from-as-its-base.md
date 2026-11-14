# ADR-0080. Pass the list set a restore was computed from as its base

- Status: Accepted
- Date: 2026-11-14
- Deciders: repository owner
- Supersedes: [ADR-0036](./ADR-0036-keep-rule-set-snapshots-beside-config-versions.md), the reconciliation base of restore only

## Context and problem statement

Restoring a version (`POST /api/config/versions/{id}/restore`, [ADR-0036](./ADR-0036-keep-rule-set-snapshots-beside-config-versions.md)) reads the current list files of `rule-sets/`, computes which of them to delete, and only then starts Apply. ADR-0036 gave restore no reconciliation base: Apply compares the set with the last fingerprint the daemon wrote. That fingerprint lives in memory, so after a daemon restart the comparison is skipped. A file added to `rule-sets/` between the computation and the start of Apply then survives the restore, and the restored version is not marked current (issue [#249](https://github.com/mderkach/metabox/issues/249)).

In scope: which base restore passes for the lists. Out of scope: the base for the config, the Apply protocol itself.

## Decision drivers

- A restore leaves the lists exactly as the version snapshot, or refuses.
- The behaviour does not depend on whether the daemon restarted.
- No new branch in the Apply manager: the client base already outranks the daemon's own fingerprint ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)).

## Considered options

1. **Base = the set the delete list was computed from.** Restore passes `config.ListsEtag` of that set as `lists_base`. Any change in between is refused. An edit of `rule-sets/` made before the restore request is overwritten, also while the daemon still remembers its own set and would have refused it before. **Chosen** by the owner: restore is a rollback to the snapshot.
2. **Same base, plus a refusal when the daemon's own fingerprint differs.** Keeps the refusal on an earlier outside edit, but needs a restore-only check in the Apply manager, because a client base normally replaces that comparison. **Rejected**: a new logic branch for a case the owner accepts.
3. **Bases for the config and the lists together.** Symmetric, but the config has no delete list and no race, and a restore after an outside config edit would change behaviour without a reason. **Rejected.**
4. **Keep ADR-0036 as is.** The race stays. **Rejected.**

## Decision outcome

- `handleVersionRestore` in `apps/metaboxd/internal/httpapi/httpapi.go` passes the fingerprint of the current set its delete list was computed from as the list base of Apply.
- A mismatch is the ordinary list refusal: `409 config_modified`, the code lists share with the config.
- The config base of a restore stays empty. A version without a list snapshot does not touch the lists and passes no list base.

## Consequences

### Positive

- A file added during a restore is refused, before and after a daemon restart.

### Negative

- Config and lists now react differently to an outside edit made before the restore request while the daemon runs: an SSH edit of the config is still refused with `409 config_modified`, an SSH edit of `rule-sets/` is overwritten by the restore.

### Neutral or deferred

- The panel already shows `config_modified`; no panel change.

## Compatibility, migration and rollback

Not applicable: no contract or stored data change. Rollback is returning the empty list base in the handler.

## Validation

- `go test ./internal/httpapi/`: `TestConfigVersionRestoreCarriesLists` expects the list base equal to `config.ListsEtag` of the current set; `TestConfigVersionRestoreLegacyKeepsLists` expects empty bases.
- `go test ./internal/apply/`: `TestStartChecksListsBase` refuses a mismatched list base on a fresh manager, the state after a restart.

## Links

- [ADR-0036](./ADR-0036-keep-rule-set-snapshots-beside-config-versions.md), list snapshots beside config versions;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), the Apply protocol and its bases;
- `apps/metaboxd/internal/httpapi/httpapi.go`, `apps/metaboxd/internal/apply/apply.go` (`verifyListsBase`);
- issue [#249](https://github.com/mderkach/metabox/issues/249).
