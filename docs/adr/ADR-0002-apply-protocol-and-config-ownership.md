# ADR-0002. Own the config as bytes and apply it with an asynchronous transaction

- Status: Accepted
- Date: 2026-09-08
- Deciders: repository owner
- Supersedes: section A.4 of [`../PRD.md`](../PRD.md)
- Superseded by (as to the subject of validation): [ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md)

## Context and problem statement

The daemon must become the owner of `config.json` on the device: write the config, check it with the binary, restart the service, make sure it came up, and restore the previous version if the connection was not confirmed (AC-13…AC-16, AC-29). At the moment `apps/metaboxd/main.go` has only `GET /healthz`, and none of these decisions has been made in code yet.

Section A.4 of the PRD sets a sequence of nine steps but leaves open what correctness depends on: in what form the daemon holds the config, what exactly is validated before writing, where the state of an unfinished apply lives and how it survives a reboot. These decisions define the API contract the frontend will then build on, so they are made before the code.

Constraints come from the environment and have already been checked:

- The service starts in directory mode: `sing-box -D /etc/sing-box -C /etc/sing-box run` (the test bench's `init.d/sing-box` at the time of the decision; removed by commit `22088194`, the test bench installs the fork's package, which runs the service from a single file with `run -c … -D …`; [ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md) refines the subject of validation). In this mode the binary merges all files in the directory with the `.json` suffix.
- `/var` in the OpenWrt rootfs is a symlink to `/tmp` ([`../../.devcontainer/target/Dockerfile:44`](../../.devcontainer/target/Dockerfile)).
- The init script of the real package has no `check` command; at the time of the decision only the test bench script had it ([DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md), "Service via procd").
- The fork's Clash API disables authorization entirely when `secret` is empty (`experimental/clashapi/server.go:259` of version `v1.13.18-extended-2.6.5`); on the router the panel answers without a token.
- The dev server proxies the API with `changeOrigin: true` ([`../../apps/web/vite.config.ts:39`](../../apps/web/vite.config.ts)): the daemon receives a rewritten `Host` and the original `Origin`.

In scope: the config representation in the daemon, the shape of the Apply contract, the subject of validation, storage of the transaction state, the request origin check policy. Out of scope: version history and rollback to an arbitrary version (AC-15), showing changes to the user (AC-32), the internal config model and the adapter layer: they live on the frontend, steps 1 and 2 of the protocol.

## Decision drivers

- Preserving someone else's config: a round-trip neither loses nor reorders data (AC-2, AC-3).
- Restoring access without SSH after a failed apply (AC-14), including the case when the owner cut the power.
- Validating exactly what will be run, not a file that resembles it.
- Contract stability: adding deferred functionality does not break an already written client.
- Testability on the existing test bench.
- Maintenance cost: the less code duplicates what the frontend or the binary already does, the better.

## Considered options

### Config representation in the daemon

1. **Parse into `map[string]any` and serialize back**: **rejected**. `encoding/json` serializes a map in alphabetical key order, so every apply rewrites the order in the user's file. This directly violates AC-2, where the only allowed difference is the added `experimental.clash_api` section.
2. **A dedicated Go config model**: **rejected**. A model already exists on the frontend on top of the generated schema; a second implementation means a permanent drift from `apps/web/src/shared/api/generated.ts` and duplication of the adapter layer's work.
3. **Bytes plus a targeted patch**: **chosen**. The daemon takes the request body as is and writes it verbatim. The only structural operation is inserting `experimental.clash_api` when it is missing.

### Shape of the Apply contract

1. **A synchronous `POST` that answers when the cycle finishes**: **rejected**. Steps 8 and 9 of the protocol (confirmation window, automatic rollback) make the apply a process that lives longer than the request. A synchronous answer would have to change when they appear, together with the already written client.
2. **An asynchronous transaction**: **chosen**. Matches the `ApplyTransaction` entity from appendix C of the PRD ([`../PRD.md`](../PRD.md)), where `state` and `confirmDeadline` are already declared.

### Subject of validation before writing

1. **`/etc/init.d/sing-box check`**: **rejected**. The real package has no such command, and on the test bench it checks the installed config, not the candidate.
2. **`sing-box check -c <candidate file>`**: **rejected**. It checks one file, while the service comes up on the merged directory. As long as the directory holds a single `config.json` there is no difference; as soon as the user drops a second `.json` there (a regular sing-box feature), the daemon starts validating something other than what will run, and the failure shows up silently: `check` is green, the service did not come up, the automatic rollback spins.
3. **`sing-box check -C <candidate directory>`**: **chosen**. The candidate is put into a temporary directory together with the other `.json` files from the working one and is checked by the binary directly.

### Storage of the transaction state

1. **`/var/lib/metabox` and an absolute `confirmDeadline`**: **rejected for two reasons**. `/var` is a symlink to `/tmp`: the state does not survive a reboot, and the owner's typical reaction to a lost connection is to cut the power, after which the automatic rollback never happens and the router stays on the broken config. An absolute timestamp does not fit either: a router without an RTC starts from the epoch after power-on and jumps on NTP sync, so the comparison "has the deadline passed?" gives garbage both ways.
2. **A persistent directory and a deadline stored as a duration**: **chosen**. The state lives in `/etc/metabox` by default, and the deadline is stored as a duration together with an "applied but not confirmed" flag.

### Origin check of a mutating request

1. **Let a request without `Origin` through**: **rejected**. It weakens protection exactly where it is needed: [ADR-0041](./ADR-0041-run-v1-without-authentication-behind-network-and-origin-checks.md) introduces a CSRF check, and the browser sends `Origin` on all mutating requests.
2. **Strict matching by default, relaxation by an explicit flag**: **chosen**. The dev test bench is served by a flag, not by a hole in the rule.

## Decision outcome

The apply sequence, carried over from A.4 of the PRD unchanged:

1. Validation by the internal model, on the frontend.
2. Serialization to `config.json`, on the frontend.
3. `sing-box check` on the candidate config.
4. Backup of the current config.
5. Writing the new config.
6. Restarting the service through procd.
7. Healthcheck: the service came up, the Clash API answers.
8. Confirmation window: the user confirms that the connection is alive.
9. No confirmation in time: the daemon restores the previous config and restarts the service.

The daemon is responsible for steps 3–9. Steps 1 and 2 stay on the frontend.

**Config ownership.** For the daemon the config is a byte sequence. The request body is written verbatim; parsing into structs or a map is forbidden. The only allowed structural edit is inserting `experimental.clash_api` while keeping the other bytes.

**`clash_api` guarantee.** The section is added only if it is missing or `external_controller` is empty (verbatim per AC-31). Existing user values are not changed; in particular, a missing `secret` is not added. The healthcheck takes the address and the secret from the candidate config and turns a wildcard address into loopback; a missing secret is a normal case, not an error.

**Writing.** A temporary file in the target directory, `fsync` of the file, `rename`, `fsync` of the directory. The temporary file name does not end with `.json`. The daemon's service files (the backup and the transaction state) are placed outside the config directory.

**Transaction.** `POST /api/apply` returns an identifier and a state, `GET /api/apply/{id}` returns the state, `POST /api/apply/{id}/confirm` confirms the apply. `GET /api/status` holds a reference to the active transaction: without it, reloading the page loses an ongoing apply. The transaction state is written to disk before the config is written. On start the daemon replays an unfinished transaction: an apply without completion means rollback to the backup; waiting for confirmation with the deadline passed means immediate rollback; with the deadline not passed, the timer is restored.

**Rollback without a previous config.** The device may have no config before an apply: the first run, or a config deleted by the owner over SSH. Step 4 then removes the config backup of an earlier transaction, so the rollback cannot bring back a deleted config, but still snapshots the `rule-sets/` files if there are any. Step 9 returns those files alone, leaves the written config in place and does not restart the service: there is no config to restart onto, and the fork rereads list files without a restart. The transaction closes as `failed` with reason `lists_restored`; with no list files either, nothing is touched and the reason is `no_backup`. Neither case is reported as `rolled_back`. The replay on start takes the same path.

**External edits.** Before applying, the daemon compares the file's `sha256` with the last one it wrote itself. A mismatch is returned as a separate state and is not silently overwritten.

**Binary errors.** The output of `check` is passed to the caller verbatim: `stdout`, `stderr` and the exit code, without rewording.

**Request origin.** On mutating requests the host from `Origin` must match `Host`; a request without `Origin` is rejected. The `-allowed-origin` flag adds an allowed value and is meant for the dev test bench.

Deliberately deferred: version history and rollback to an arbitrary version (AC-15); one backup is enough for the automatic rollback, and history is built on top. Non-goal: parsing and validating the config with an internal model on the daemon side.

## Consequences

### Positive

- Someone else's config survives an apply byte for byte, except for the section AC-2 allows.
- The contract does not change when the confirmation window, the automatic rollback and version history appear: states and endpoints are added.
- The same set of files that the service will bring up is validated.
- The automatic rollback survives a device reboot, not only a process restart.

### Negative

- The daemon does not understand the config's contents and cannot check it on its own: the only meaningful check is calling the binary.
- A targeted insert of `clash_api` into bytes is harder than editing a parsed structure and needs its own preservation tests.
- An asynchronous transaction costs more than a synchronous request: it needs on-disk state, recovery on start and polling from the UI.
- Writing the state to `/etc` increases the number of operations on the device's flash.

### Neutral or deferred

- Version history (AC-15) and showing changes to the user (AC-32) are separate tasks on top of this decision.
- The backup format is chosen so that version history can be added on top additively, but this decision does not deal with the history itself.
- "Waiting for confirmation with the deadline passed" in "Decision outcome" in practice happens only with a window of 0: the deadline is stored as a duration, the remainder of the window is not written, and after a reboot the window is granted in full — OQ-22 in [`../PRD.md`](../PRD.md).

## Risks and mitigations

| Risk                                                                        | Likelihood and impact                  | Mitigation                                                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Directory `fsync` on OpenWrt overlayfs behaves differently than expected    | Low likelihood, high impact (AC-29)    | Run the write on the test bench while the target FS is unverified                                                     |
| The automatic rollback does not fire because of lost state                  | Medium likelihood, high impact (AC-14) | State on a persistent FS, replay on start, check by rebooting the test bench                                          |
| A generated `secret` breaks already configured Clash API clients            | Low after the decision, high impact    | The section is not touched when `external_controller` is not empty; checked on the device config, which has no secret |
| The strict `Origin` check rejects legitimate requests from the dev frontend | High likelihood, medium impact         | The `-allowed-origin` flag and an acceptance check of a request through the vite proxy                                |

## Compatibility, migration and rollback

Nothing to break: the daemon does not own the config yet and has no API. The existing `config.json` on the device is accepted as is; this is exactly the AC-1 requirement.

Rolling back the decision means giving up the asynchronous contract for a synchronous one and costs a client rewrite; the reverse (adding states) is compatible. The `apply-cycle-check` run stays an independent check of the environment itself and keeps working: it calls the Clash API without a token, and the daemon does not add a secret.

## Validation

- `make test`: unit checks of writing and of the transaction: the temporary file does not end with `.json`; an error at any step before `rename` leaves `config.json` unchanged byte for byte; applying a config that already has a `clash_api` section gives the same `sha256`; a config without the section gets only that section; an unfinished transaction is replayed on start for each of the states; a rollback without a previous config returns the list files alone with reason `lists_restored`, and without them closes with `no_backup`.
- `make apply-check` and a run through the daemon on the test bench: the full cycle up to the healthcheck; no confirmation in time restores the previous config; a broken config does not change the file's `sha256`; an apply with the service stopped brings it up (AC-16).
- Rebooting the `target` container with an unfinished transaction: the automatic rollback happens.
- A request through the vite proxy with `-allowed-origin` passes; the same request without the flag and with a foreign `Origin` is rejected.

The AC-13, AC-14 and AC-27 checkboxes stay unchecked until the UI appears: their wording requires the user to see the result. AC-29 is not checked until writing is verified on the target file system.

## Links

- [`../PRD.md`](../PRD.md): section 5 (AC-2, AC-3, AC-13…AC-16, AC-19, AC-29, AC-31, AC-32), section A.4, appendix C (`ApplyTransaction`, `ConfigVersion`);
- [`ADR-0001`](./ADR-0001-generate-schema-from-fork-registries.md): the schema the frontend config model works on;
- [`../../.devcontainer/target/files/usr/bin/apply-cycle-check`](../../.devcontainer/target/files/usr/bin/apply-cycle-check): the existing cycle check on the test bench;
- `experimental/clashapi/server.go` of the fork `v1.13.18-extended-2.6.5`: authorization behaviour with an empty secret.
