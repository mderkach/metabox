# ADR-0069. Manage only the metabox-singbox service

- Status: Proposed
- Date: 2026-10-25
- Deciders: repository owner
- Supersedes (as to the check mode, the `launch_mismatch` refusal and services under another owner): [ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md)

## Context and problem statement

sing-box is started by the service from the panel's own package, [`metabox-singbox`](../../apps/metaboxd/package/etc/init.d/metabox-singbox), procd instance `sing-box`, with `run -c <config_dir>/<config_name> -D <config_dir>`; the paths come from the same `metabox` UCI section the daemon reads (AC-48). The owner decided that sing-box will ship with the project.

The daemon still carries support for a sing-box service owned by another package, left from the migration period:

- UCI options `init_script` and `service_instance` and the flags `-init-script` and `-service-instance` that point the daemon at any init script and procd instance;
- multi-instance selection in `internal/procd`: an empty instance name means "the only one", several give `procd.ErrAmbiguousInstance` and the service code `service_instance_ambiguous`;
- the check mode chosen from the service command ([ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md)): directory mode `check -C`, and a `409 launch_mismatch` refusal for a service started on another config file, several files or a file and a directory;
- a refusal of a dataplane model change on another init script (`apply.ErrDataplaneForeignService`, `409 dataplane_foreign_service`) and the `foreign_service` field of `GET /api/dataplane`, by which the panel disables the device toggle;
- a comment in the interception check about another service with chains of its own.

For `metabox-singbox` none of these branches runs: its command is always one `-c` on the daemon config with `-D` on the config directory, the service has one instance, and its init script reads the dataplane model. A UCI change of `config_dir` or `config_name` reloads both services by their procd triggers, so the command does not drift from the daemon paths. The branches cost tests, contract codes, panel texts and documentation without serving a product scenario.

In scope: what service the daemon manages and what goes away with the support for others. Out of scope and kept:

- the working directory check for list files, `409 workdir_mismatch` ([ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md));
- reading the service state from procd over ubus and control through the init script ([ADR-0009](./ADR-0009-read-service-state-from-procd.md)); the instance is now fixed;
- detection of a sing-box process running outside `metabox-singbox` (AC-36, `managed=false`): the sing-box package still installs its own service until sing-box is bundled;
- the bypass for router traffic already marked by another daemon (AC-57) and a disabled dataplane model never removing ip rules and tables it did not install (`make dataplane-check`, section 14).

## Decision drivers

1. **One supported setup**: the PRD describes only the package service (AC-48); code paths outside it are untested on the device.
2. **Apply safety for metabox-singbox stays identical**: the check command, the path base and the healthcheck do not change for it.
3. **Cost of the contract**: every error code is a panel text in two languages and a compile-time table entry.
4. **Startup compatibility**: an existing `/etc/config/metabox` with the old options must not stop the daemon.
5. **Testability on the CI bench**: the HTTP Apply suite ([ADR-0067](./ADR-0067-test-http-apply-on-the-disposable-ci-bench.md)) needs a restart barrier without a product flag.

## Considered options

1. **Fix the service and remove the support for others.** The daemon calls `/etc/init.d/metabox-singbox` and asks procd about the instance `sing-box`; the options, flags, multi-instance selection, directory mode, `launch_mismatch`, `dataplane_foreign_service`, `service_instance_ambiguous` and `foreign_service` go away. Breaking for the API, but no supported client depends on the removed codes: the panel ships with the daemon. **Chosen.**
2. **Keep the flags, drop only the UCI options.** Smaller diff in `main.go`, and the CI barrier could point the flag at a wrapper. But the daemon would still need the foreign-service refusals for a flag value other than the package service, so most of the code and the contract codes stay (drivers 1 and 3). **Rejected.**
3. **Keep the current approach.** No breaking change, but the branches keep costing tests, texts and documentation for a setup the product does not ship (drivers 1 and 3). **Rejected.**

## Decision outcome

- The init script path is a constant, `/etc/init.d/` + `dataplane.Service`, set in `main.go`; the procd instance is `singbox.Instance` (`sing-box`). There are no `-init-script` and `-service-instance` flags, and the init script `metaboxd` does not read `init_script` and `service_instance` from UCI: options left in an existing `/etc/config/metabox` are ignored.
- `procd.Client.Service` returns the state of the named instance only; a service without it is unknown. `ErrAmbiguousInstance` and the service code `service_instance_ambiguous` are removed.
- The candidate is always checked as `check -c <candidate>/<name> -D <base>`. The path base is chosen as before: the candidate, or the service working directory when it is outside the config directory and exists; with list files such a directory is `409 workdir_mismatch`. `apply.LaunchError` and the code `launch_mismatch` are removed; `singbox.Client.Check` takes only the file and the working directory.
- `apply.ErrDataplaneForeignService`, `Plane.ForeignService`, `PlaneOptions.Service`, the code `dataplane_foreign_service` and the field `foreign_service` of `GET /api/dataplane` are removed; the panel no longer has a disabled toggle branch for them.
- The CI barrier replaces `/etc/init.d/metabox-singbox` with a wrapper by rename and keeps the original under the same basename in a temporary directory, so procd still registers the `metabox-singbox` service; cleanup puts the original back by rename.

Non-goal: managing a sing-box service of another package. Such a setup is not detected; the daemon writes its config and restarts `metabox-singbox`.

### Scope and boundaries

`apps/metaboxd/main.go`, `internal/procd`, `internal/singbox`, `internal/apply` (`resolveCheck`, `check`, `Plane`), `internal/httpapi`, `internal/contract`, `internal/locale/ru.go`, `apps/metaboxd/package/etc/config/metabox`, `package/etc/init.d/metaboxd`, `apply_integration_test.go`, the bench UCI file, and in the panel `daemon.generated.ts`, `failureText.ts`, `features/Device/DeviceRoute`, `widgets/Daemon/DaemonService` and their dictionaries.

## Consequences

### Positive

- One service, one instance and one check command: the code paths that run on the device are the ones the tests cover.
- Three error codes, one response field and their panel texts leave the contract.
- The CI barrier no longer restarts the daemon to switch the init script.

### Negative

- A breaking API change: a client outside the panel that relies on the removed codes or the field breaks.
- A setup that points the service at another config is no longer refused before the write; the daemon writes a file such a service does not read, and the healthcheck decides.
- The CI barrier edits a packaged file on the disposable bench; a cleanup failure leaves the wrapper in place until the bench is recreated.

### Neutral or deferred

- Detection of a foreign sing-box process (AC-36) stays until sing-box is bundled; removing it is a separate decision.
- Temporary file names not ending in `.json` stay: they cost nothing and protect any tool that merges the config directory.

## Compatibility, migration and rollback

An existing `/etc/config/metabox` with `init_script` or `service_instance` keeps working: the options are ignored. A setup where they pointed to another service ends up managing `metabox-singbox`; no such setup is supported. The contract loses `launch_mismatch`, `dataplane_foreign_service`, `service_instance_ambiguous` and `foreign_service`; the panel and the daemon ship together.

Rollback: revert the change; the options and flags return with their previous defaults, which equal the fixed values.

## Validation

- `cd apps/metaboxd && go test ./...`: `procd` reads the named instance and treats a missing one as unknown; `singbox` calls `check -D <base> -c <file>` and asks the init script and procd about the `sing-box` instance; `apply` checks the candidate as a file from the candidate or the service working directory, and refuses list files on a different working directory.
- `make schema-daemon`: the removed codes and the field are absent from `apps/web/src/shared/api/daemon.generated.ts`; `pnpm --filter web build` passes without their texts.
- `make dataplane-check`: section 14 still shows that a disabled model leaves another service's ip rule and table.
- CI `integration`: the restart barrier through the replaced init script interrupts and replays an Apply.

## Links

- [PRD](../PRD.md): AC-36, AC-48, AC-56, AC-57;
- [ADR-0009](./ADR-0009-read-service-state-from-procd.md): the service state from procd, control through the init script;
- [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md): the working directory check for list files;
- [ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md): the check mode and the `launch_mismatch` refusal, superseded in part;
- [ADR-0047](./ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md): the dataplane in the `metabox-singbox` init script;
- [ADR-0067](./ADR-0067-test-http-apply-on-the-disposable-ci-bench.md): the HTTP Apply suite and its restart barrier;
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md): the service through procd.
