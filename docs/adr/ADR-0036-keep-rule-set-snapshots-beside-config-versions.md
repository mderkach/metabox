# ADR-0036. Keep a snapshot of list files in a sibling directory next to the config version

- Status: Accepted
- Date: 2026-10-04
- Deciders: repository owner

## Context and problem statement

[ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md) allowed a large custom list to be kept as a file in the `rule-sets/` subdirectory of the config directory and required such a file to live in one transaction with the config: "in the version history the file is stored next to the config of the same version, rollback returns both". The Apply transaction already does this: the candidate check, the backup and the automatic rollback cover both the config and the `rule-sets/` files. The version history ([ADR-0008](./ADR-0008-store-config-versions-as-numbered-copies.md)) does not: a version stores only the config bytes, restore goes into Apply with the config alone, and the list files stay current. A version config that references an already deleted file is caught by `sing-box check`, but a config referencing a changed file is restored with someone else's list content, and routing silently diverges. The risk is recorded in the ADR-0033 table.

The decision is needed now: the panel starts editing large lists as files, and "roll back to yesterday" without the lists stops being a rollback.

Constraints set earlier:

- The ADR-0008 layout: `<state-dir>/versions/` with mode `0700`, a version is a `0600` file with a six-digit number and no extension, the last ten are kept, numbers are not reused, a repeat of the same content is not written to the history. A daemon of the previous version enumerates the directory (`listIDs`, `listVersions` in `apps/metaboxd/internal/config/version.go`): it skips subdirectories and names that do not match the format.
- A history failure does not stop the apply (ADR-0008); restore is an ordinary Apply, there is no separate write that bypasses the protocol.
- List files arrive in the apply envelope, whose ceiling is 16 MiB (`maxApplyBytes` in `internal/httpapi/httpapi.go`). The device overlay has tens of megabytes free (ADR-0008).
- Files the daemon writes to `rule-sets/` pass the name check `config.ValidListName` in `internal/config/lists.go`; the daemon neither writes nor deletes foreign files in the subdirectory.

In scope: where the snapshot lives, when a version counts as saved, what counts as a repeat, which metadata the panel sees, how restore returns the files, how much space it costs. Out of scope: comparing lists between versions in the panel and the Apply protocol itself.

## Decision drivers

1. **Rollback to the old daemon** does not break the history and does not reset the number counter: the update is additive, without `BREAKING CHANGE`.
2. **Version integrity on power loss**: a version without its snapshot or a snapshot without a version is not presented as a complete record.
3. **Old versions are readable**: history saved before the decision stays accessible and is restored as before.
4. **Space usage** on a device with tens of free megabytes.
5. **Implementation cost**: an extension of the existing history, not a second mechanism.

## Considered options

1. **Keep the history without lists.** Zero work, but the ADR-0033 risk stays open: restoring a version puts the config on top of someone else's lists. With large list editing in the panel this directly breaks rollback. **Rejected.**

2. **A directory per version: `versions/000007/config.json` and `versions/000007/rule-sets/`.** This was proposed by the tech debt entry "Version history does not store list files", which this decision closes. A version is one object, the snapshot is inseparable from the config. But the layout changes incompatibly (driver 1): a daemon of the previous version skips subdirectories, so after a rollback to it the history looks empty and the counter starts at `000001`, and the very first `writeAtomic` hits a directory with the same name, so saving a version fails on every apply. Old file versions would have to be either migrated or supported through two read formats (drivers 3 and 5). **Rejected.**

3. **A snapshot in one archive file next to the version** (`000007.rule-sets.tar`). Compatible with the old daemon in the same way as option 4. But the archive format is either `archive/tar` with its own path handling on extraction, or a custom one; identical files of neighbouring versions are not shared, and each version pays the full size of the lists (driver 4). **Rejected.**

4. **A sibling directory next to the version file: `versions/000007` and `versions/000007.rule-sets/`.** The version file stays as it was, and a directory with the snapshot appears next to it. The old daemon skips the directory and does not parse `000007.rule-sets` as a number, so its history and counter stay the same (driver 1). Old versions are simply versions without a sibling (driver 3). Identical files of neighbouring snapshots are linked by a hard link (driver 4). Drawback: a version is two file system objects, and their consistency is ensured by write order rather than by the atomicity of a single `rename`. **Chosen.**

## Decision outcome

**Layout.** Next to the version file `<state-dir>/versions/NNNNNN` lies the directory `NNNNNN.rule-sets/`: a snapshot of the top-level files of `rule-sets/` in the config directory at the moment the version is saved: the same names, the same bytes, mode `0600`, directory `0700`. A snapshot may be empty: "there were no lists" is also a state that rollback returns to. Only names managed by the daemon (`config.ValidListName`) go into the snapshot. Subdirectories, the owner's foreign files (`.srs`, notes) and leftovers of an interrupted write `.metabox-*` do not: the daemon does not write them, restore would not bring them back, and the fingerprint of the restored version would not match the current one. The same rule applies to the sum of the current set, the automatic rollback backup and the rollback from it: the daemon does not read foreign files in `rule-sets/` into the fingerprint, does not copy them and does not delete them.

**What is captured and when.** The snapshot is taken by `config.Store` in `SaveVersion` under the same mutex under which it reads the history directory, the same way `Backup` takes the list backup. The `SaveVersion` signature does not change: the Apply cycle still calls it after the backup and before the write, so the snapshot, like the version config, is the state before the transaction.

**The commit point is the version file.** Write order:

1. remove the orphan `NNNNNN.rule-sets` of the next number and the draft of the previous failed attempt;
2. build the snapshot in the draft, each file by atomic write, then `fsync` the draft;
3. `rename` the draft to `NNNNNN.rule-sets`, `fsync` the history directory;
4. write the version file atomically; from this moment the version exists.

An interruption before step 4 leaves an orphan without a number: enumeration does not see it, the next save of the same number removes it, and so does history pruning. A version without a sibling directory, on the contrary, means "no snapshot", not "there were no lists".

**Repeat.** A version is not written if both the config and the list set match the most recent version. The set matches when the names and the `sha256` of every file match. An old version without a snapshot equals only an empty current set: otherwise, after a daemon update, the first apply with list files would not get into the history. A change to the list alone gives a new version with the same config.

**Space.** A file whose `sha256` matches the file with the same name in the snapshot of the most recent version is not copied but linked by the hard link `os.Root.Link`. The file system may refuse the link; then the file is copied: saving space is not a reason to refuse a version. Versions are immutable, and writes to the shared inode are not a threat: both snapshots and working files are written only by atomic replacement, never edited in place.

The worst case is ten applies in a row, each with completely new lists at the envelope ceiling: about 160 MiB on top of the working files. The practical case: lists change rarely, and an unchanged file costs one directory entry in each subsequent snapshot. Retention stays the same: ten versions.

**Pruning.** Together with surplus versions, their sibling directories are deleted, as well as any `NNNNNN.rule-sets` directory whose number is not among the kept versions: orphans of an interrupted write and snapshots left after pruning by a daemon of the previous version.

**Metadata.** `config.Version` gets `lists_sum`: the fingerprint of the snapshot set, computed by a streaming `sha256` of each file without reading the whole snapshot into memory; a version without a snapshot has no such field. The `GET /api/config/versions` response gets `current_lists_sum`: the fingerprint of the current set in the same record and over the same names. The set fingerprint (names with sums in a stable order) is computed by one function, `config.ListsEtag`, the same one that produces `etag` in `GET /api/config/rule-sets` and checks the apply's `lists_base`. The panel marks a version as current only when both `sum` and `lists_sum` (if present) match.

**Restore.** `POST /api/config/versions/{id}/restore` reads the snapshot and runs an ordinary Apply with an envelope: the snapshot files are written, current files missing from the snapshot are deleted. Names that Apply does not accept (`config.ValidListName`) are skipped: restore does not touch foreign files in `rule-sets/` and does not fail because of them. Restore has no reconciliation base for either the config or the lists: the apply checks the set against the last one written by the daemon, and an edit of `rule-sets/` that bypasses the panel gives `409 config_modified`, like a config edit. A version without a snapshot is restored as before: the config alone, list files are not touched. The service working directory check, `sing-box check` of the candidate, the backup and the automatic rollback work for the restore envelope the same way as for an edit from the editor.

### Scope and boundaries

`apps/metaboxd/internal/config` (history, set fingerprint), `internal/apply` (building the restore envelope), `internal/httpapi` and `internal/contract` (history endpoints), the panel: marking the current version. The Apply protocol does not change.

The decision refines ADR-0008 (the layout, the repeat rule and the metadata) and fulfils the ADR-0033 requirement about the history. The ADR-0033 validation item "no list files appear in `<state-dir>`" refers to storing a list instead of the config; history snapshots are copies of what lies in the config directory, not a second source of truth.

## Consequences

### Positive

- Restoring a version returns the config and the lists in one transaction: the ADR-0033 risk "rollback returns the config but not the list file" is closed for the history as well, not only for the automatic rollback.
- The update is additive: old versions are readable, a daemon of the previous version sees the same history and the same counter.
- Unchanged lists cost almost no space in the history.
- The panel distinguishes a version that matches the device by config but not by lists, and allows restoring it.

### Negative

- A version is two file system objects kept consistent by write order. This is more code than one file and more states to test: an orphan, a version without a snapshot, an empty snapshot.
- The worst case for space is around 160 MiB, which is more than the free overlay. Retention by number of versions rather than by size remains.
- `SaveVersion` reads the current list files into memory in full, as `Backup` does. With the 16 MiB envelope ceiling this is a short peak for the duration of the apply.
- Restoring a version with a snapshot requires the service working directory to match the config directory (a check before writing the files), even if the snapshot files equal the current ones.
- An edit to a foreign file in `rule-sets/` is no longer visible as an external edit of the lists: the set fingerprint does not include it. The daemon does not touch such a file anyway, and `sing-box check` still sees it in the candidate.

### Neutral or deferred

- Comparing lists between versions in the panel is not done: the fingerprint is enough to tell versions apart.
- Retention by history size is deferred until the real lists on the device are measured.
- A daemon of the previous version prunes only version files; their sibling directories stay until the first save by the new daemon.

## Risks and mitigations

| Risk                                                                                             | Probability and impact                                                                             | Mitigation                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History with snapshots fills the overlay, and the config write in the next Apply fails           | Low with rare list edits, high impact                                                              | Hard links to unchanged files; pruning in the same call; a write failure is rolled back by the transaction. Retention by size: after measurement           |
| Power loss between the snapshot and the version file                                             | Low, low impact                                                                                    | The version file is the commit point; the orphan is invisible and is removed by the next save or by pruning                                                |
| A rollback to the previous daemon after an orphan leaves it under a number that daemon will take | Very low, medium impact: the version gets someone else's snapshot when returning to the new daemon | The orphan lives only between the interruption and the next apply; the previous daemon would have to be installed exactly in that window                   |
| Restore deletes a file the owner put in `rule-sets/` by hand                                     | Low, medium impact                                                                                 | Only names that Apply itself writes are deleted (`config.ValidListName`); the edit would pass `sing-box check` and the confirmation window, like any apply |

## Compatibility, migration and rollback

No migration is needed. Versions saved before the decision stay files without a sibling directory: they have no `lists_sum`, restoring them does not touch the lists, and the repeat rule treats them as equal only to an empty set.

Rollback to a daemon of the previous version: the history and the counter are the same, sibling directories are ignored, restore again does not touch the lists. Pruning by the previous daemon leaves the directories of deleted versions; the first save after returning to the new daemon removes them, or they can be deleted by hand.

The contract is extended with two optional fields (`lists_sum`, `current_lists_sum`): a panel of the previous version ignores them, and a new panel on a daemon of the previous version sees that they are absent and compares only `sum`.

## Validation

- `cd apps/metaboxd && go test ./internal/config/`: the snapshot survives a later write of the lists; an empty set gives an empty directory; a version without a directory returns `ErrNoVersionLists`, while the version list and content are readable; a repeat is judged by the config and the set; pruning leaves exactly ten sibling directories; an orphan is replaced; modes `0700`/`0600`; not a single new file appears in the config directory; foreign names get into neither the snapshot nor the fingerprint, and rollback does not remove them; a snapshot failure leaves no version file.
- `go test ./internal/apply/`: the restore envelope writes the snapshot files, deletes extra ones, skips invalid names.
- `go test ./internal/httpapi/`: restore carries the snapshot files without reconciliation bases; a version without a snapshot is restored without an envelope; an unreadable snapshot or current set does not start an apply; a working directory failure returns `409 workdir_mismatch`; the version list carries `current_lists_sum`.
- `make schema-daemon`: exactly two optional fields appear in `apps/web/src/shared/api/daemon.generated.ts`.
- On the test bench: apply a config with a list, change the list, restore the first version; the file in `rule-sets/` comes back byte for byte, `ls <state-dir>/versions` shows the sibling directories.

## Links

- [PRD](../PRD.md): AC-8, AC-15;
- [ADR-0008](./ADR-0008-store-config-versions-as-numbered-copies.md): version history as numbered copies, refined by this decision;
- [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md): custom lists as files in `rule-sets/` and the requirement to keep them in the history;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): the Apply protocol;
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md): atomic write and the service directory;
- `apps/metaboxd/internal/config/version.go`, `internal/config/lists.go`, `internal/apply/apply.go`, `internal/httpapi/httpapi.go`.
