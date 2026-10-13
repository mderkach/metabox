# ADR-0008. Keep config history as numbered copies in a service directory, and roll back with a regular Apply

- Status: Accepted
- Date: 2026-09-11
- Deciders: repository owner

## Context and problem statement

AC-15 requires config version history in the interface and rollback to any of the versions. [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) deferred it deliberately: "one backup is enough for the automatic rollback, and history is built on top", and the backup format was chosen so that the extension would be additive. Before this decision `config.Store` held exactly one `config.backup`, a safeguard for the apply cycle, not a history.

The constraints were set earlier and are not revisited here:

- **The daemon does not parse the config contents** (ADR-0002). So the history stores the whole document and knows only its size and hash.
- **Service files live outside the config directory** (ADR-0002). The service starts in directory mode and merges all `.json` files: a version next to the working file would end up in the running configuration.
- **The router has no real-time clock.** After power-on it starts from the epoch and jumps on NTP sync; ADR-0002 records this as the reason to store the confirmation window as a duration rather than an absolute time.
- **Space is limited.** On the target device the overlay is hundreds of megabytes, of which tens are free; the config takes 18 KB.

In scope: where versions live, how they are named, how many are kept, what happens on rollback and which metadata goes to the panel. Out of scope: showing differences between versions and the apply protocol itself, which does not change.

## Decision drivers

1. **Compatibility with the ADR-0002 boundaries**: the daemon does not parse the config, service files are outside the config directory.
2. **Order does not depend on the clock**: the history must stay ordered on a device that starts from the epoch.
3. **Rollback is no more dangerous than a regular apply**: returning to an old version goes through the same binary check, backup, restart and confirmation window.
4. **Predictable space usage** on a device with an overlay of hundreds of megabytes.
5. **Implementation cost**: the history is an extension of the already working backup, not a second mechanism beside it.

## Considered options

1. **Keep a single backup.** Pros: zero work, the current state. Cons: AC-15 is not covered at all: it is only possible to roll back one step, and only automatically, within the cycle. **Rejected.**

2. **Versions in the config directory.** Pros: everything in one place, no second path needed. Cons: a direct violation of ADR-0002 and a broken device: `sing-box` merges all `.json` files in the directory, so every saved version would end up in the running configuration and would most likely cancel the applied edit. **Rejected.**

3. **Versions named by save time.** Pros: the name is readable, sorting by name matches the chronology. Cons: on a router without a real-time clock, two consecutive versions after boot get identical or decreasing names (driver 2); name collisions have to be resolved with a suffix, and order is lost anyway. **Rejected.**

4. **A full log with deltas or an embedded git.** Pros: space saving, visible change history. Cons: either a dependency in a module without a single `require`, or our own delta implementation; at 18 KB per version the saving pays for neither (drivers 4 and 5). **Rejected.**

5. **Numbered copies in the daemon's service directory.** Pros: order is set by a monotonic counter and does not depend on the clock (driver 2); the directory is outside the config (driver 1); a full copy keeps the owner's formatting and key order, which AC-2 requires; it is built on top of the existing backup without a second mechanism (driver 5). Cons: space is used linearly, a retention policy is needed. **Chosen.**

## Decision outcome

**Layout.** Versions live in `<state-dir>/versions/`. The directory is created on the first access to the history (including reading an empty list) with mode `0700`, files with `0600`: they contain the same as the config, including keys.

**Names.** A six-digit decimal number without an extension, with leading zeros: `000001`, `000002`. The width is fixed because names are sorted as strings, and without padding the tenth version would come before the second. Numbers are not reused: removing old versions does not shift the counter.

**What is saved and when.** Before writing a new config, the daemon puts into the history what was applied before this cycle, next to the backup step of the ADR-0002 protocol. The history stores past states, not candidates: a config that did not pass `sing-box check` does not get into it.

**A history failure does not stop the apply.** The history is an extension of the backup and has nothing to do with the automatic rollback: a version that was not saved is logged as a warning, and the cycle goes on. The opposite behaviour would make the device's operability depend on the log.

**Retention.** The last ten versions are kept, extra ones are removed in the same call. Re-applying the same content is not written to the history: otherwise ten identical applies would push out everything it held. Ten versions of the target device's config are about 180 KB, orders of magnitude less than the free space on the overlay, while covering the practical horizon of edits.

**Metadata.** The number, size, `sha256` of the content and the file timestamp go out. The hash allows comparing a version with the active config without reading both. The timestamp is declared informational: it shows the device clock at the moment of saving and is wrong if the clock is not synchronized. The daemon does not parse the version content, here or anywhere else.

**Contract.**

| Endpoint                                 | What it does                           |
| ---------------------------------------- | -------------------------------------- |
| `GET /api/config/versions`               | list from newest to oldest             |
| `GET /api/config/versions/{id}`          | the version content, the same bytes    |
| `POST /api/config/versions/{id}/restore` | starts a regular apply of this version |

**Rollback is an apply.** `restore` passes the version content to the same `Apply` as an edit from the editor: `sing-box check`, backup, write, restart, healthcheck, confirmation window and automatic rollback. There is no separate config write bypassing the protocol. Otherwise, returning to a version that breaks connectivity would cut off access to the router without a safeguard, exactly what the protocol exists for.

### Scope and boundaries

The decision covers `internal/config` and the contract between the daemon and the panel. The apply protocol (ADR-0002) does not change: a version save step is added between the backup and the write.

## Consequences

### Positive

- The server side of AC-15 is covered without a second write mechanism: rollback goes along the tested path. The criterion itself also requires history in the interface, so it stays unchecked.
- The history order does not depend on the device clock.
- A full copy keeps the owner's formatting and key order: the same requirement as for the round-trip (AC-2).
- Space usage is bounded and predictable.

### Negative

- The history stores full copies: ten versions take ten times more than one. At 18 KB this is acceptable, with a config of megabytes it is not, and then retention will have to be revisited.
- The version number says nothing about its content. What exactly changed is shown by the panel through comparison, and the daemon does not know it by design.
- The timestamp may be wrong. This is accepted deliberately: the alternative is not to show the time at all.

### Neutral or deferred

- Comparing versions with each other and with the active config is the panel's task and is not solved here.
- Deleting a version by hand is not provided: the history trims itself.

## Risks and mitigations

| Risk                                                     | Likelihood and impact | Mitigation                                                                                                                                                |
| -------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The history directory fills up the overlay               | Low, medium impact    | Strict retention of ten versions, trimming in the same call as saving                                                                                     |
| Rolling back to a broken version cuts off access         | Medium, high impact   | Restore goes through a regular Apply: the binary check before writing, healthcheck and automatic rollback by the confirmation window                      |
| Foreign files in the service directory break the listing | Low, low impact       | Names not matching the format are skipped, and the history does not fail because of them                                                                  |
| Numbers diverge with parallel applies                    | Low, medium impact    | A single `config.Store` owns the files, and access goes only through its methods; a second apply during an active transaction is rejected by the protocol |

## Compatibility, migration and rollback

No migration is needed: there was no history before this decision, and the directory is created on the first apply. The existing backup and transaction state are not affected; their format stays the same.

Rolling back the decision: remove the save step from the cycle and the three endpoints. The `versions/` directory stays on the device and is removed by hand: it is not user data, but it cannot get in the way either.

## Validation

- After an edit is applied, a version with the previous content appears in the history, and the active config is not equal to it.
- The eleventh apply leaves ten files in the directory, and the oldest number shifts by one.
- `GET /api/config/versions/{id}` returns bytes that match what was applied: formatting and key order are kept.
- `POST /api/config/versions/{id}/restore` answers with a transaction, not "done", and the cycle is visible in `GET /api/status`.
- An unknown or non-numeric version number gives 404, and no apply starts.
- Not a single new file appears in the config directory after versions are saved.

## Links

- [PRD](../PRD.md): AC-15, AC-2, milestone M1;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): the Apply protocol, file ownership and the deferred history;
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md): atomic write and the layout of service files.
