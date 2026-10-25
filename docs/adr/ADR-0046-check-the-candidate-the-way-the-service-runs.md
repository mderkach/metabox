# ADR-0046. Check the candidate in the same mode in which procd runs the service

- Status: Accepted
- Date: 2026-10-08
- Deciders: repository owner
- Supersedes (as to the subject of validation): [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)
- Superseded by (as to the check mode, the `launch_mismatch` refusal and services under another owner): [ADR-0069](./ADR-0069-manage-only-the-metabox-singbox-service.md) (Proposed)

## Context and problem statement

[ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) chose the candidate directory as the subject of validation, `sing-box check -C <candidate>`, on the assumption that the service runs in directory mode: `sing-box -D /etc/sing-box -C /etc/sing-box run`. This fact was taken from the test bench's init script, which was removed by commit `22088194` together with the move of the test bench to the fork's package ([ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md)).

Confirmed facts:

- The fork's package runs the service from a single file: `procd_set_param command "$PROG" run -c "$config_file" -D "$working_directory"`, where `conffile` defaults to `/etc/sing-box/config.json` and `workdir` to `/usr/share/sing-box` (`release/config/openwrt.init:15-20` of the fork at `v1.14.0-extended-2.7.1`). A disabled service (`enabled=0`) does not create an instance at all.
- The test bench installs this package and changes only `workdir` to `/etc/sing-box` ([`.devcontainer/target/Dockerfile`](../../.devcontainer/target/Dockerfile)). There is no directory mode either on the test bench or in a package installation.
- The daemon already reads the instance command from procd (`ubus call service list`), but took only `-D` from it, to check the working directory before writing list files ([ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md)).

Consequences of the mismatch, derived from the code:

- **A false green check.** A neighbouring `.json` in the config directory whose outbound is referenced by `config.json` passes `check -C`, while the service on `-c` does not read it and crashes. The failure is discovered by the restart, the healthcheck and the automatic rollback instead of a refusal before the write.
- **A false refusal.** A broken or conflicting neighbouring `.json` blocks Apply, although the service does not read it.
- **A different path base.** With the package `workdir` and no list files there was no check: `check` resolved relative paths from the candidate, the service from `/usr/share/sing-box`.
- **A service on a foreign config is not caught.** If `conffile` in UCI is not the daemon's config, the daemon writes a file the service does not read, and checks something other than what will run.

In scope: which command checks the candidate, and when an apply is refused before the write because of the service command. Out of scope: the rest of the ADR-0002 Apply protocol, the working directory check for list files (ADR-0033; it is kept), support for a service under another owner (another init script, a foreign manager).

## Decision drivers

1. **Exactly what will run is validated**: the ADR-0002 driver for which `-C` was chosen.
2. **Apply safety**: a mismatch with how the service runs is discovered before the write, not by the automatic rollback.
3. **Compatibility**: a package installation of the fork works without editing someone else's files; directory mode, if someone keeps it, does not break silently.
4. **Cost**: no new dependency, based on what the daemon already reads from procd.
5. **Observability**: a refusal names the reason with a contract code, not with a service crash.

## Considered options

1. **Read the instance command from procd and check in the same mode.** The daemon extracts `-c`, `-C` and `-D` from the command and builds `check` from them, substituting the candidate for the config directory. A command that runs the service on something other than the daemon's config is a refusal before the write. The command parsing already exists; the cost is one more state branch and tests for both modes. The command may be absent (the service has not run, is disabled, or there is no procd); then a fallback mode is needed. **Chosen**, with option 3 as the fallback mode.
2. **Require directory mode: the panel package installs or patches `/etc/init.d/sing-box`.** Restores the ADR-0002 premise and does not touch the daemon. But it is a file of someone else's package: an apk file conflict, overwriting on a fork update, a mismatch with the package installation the test bench checks (drivers 3 and 4). **Rejected.**
3. **Support only package mode: `check -c <candidate>/config.json -D <candidate>`.** A minimal change, and correct for the package and the test bench. But a directory mode installation silently gets false green checks, and a service on a foreign config is still not caught (drivers 2 and 5). As the only behaviour it is **rejected**; it remains the fallback mode of option 1 when the command is not visible.
4. **A daemon flag `-run-mode`.** Simple in code, but correctness depends on the owner setting the flag right: when the service UCI is edited, the flag silently diverges from how it runs (driver 1). **Rejected.**
5. **Keep `check -C`.** Leaves all four consequences from the context. **Rejected.**

## Decision outcome

Before the check the daemon asks procd for the service instance command (`procd.Launch`: files `-c`/`--config`, directories `-C`/`--config-directory`, the working directory `-D`/`--directory` or the `cwd` of the live process; a relative config path is resolved against the working directory). A visible command without `-c` and `-C` is parsed as `-c config.json`: in that case sing-box itself reads `config.json` from the working directory (`cmd/sing-box/cmd.go` of the fork). A value taken by a flag does not count as a flag, and parsing stops after `--`. The mode is chosen by the command:

| Service command                                                                                          | Candidate check                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| not visible: has not run, disabled, no procd                                                             | `check -c <candidate>/<name> -D <base>`         |
| a single `-c` equal to `-config-dir`/`-config-name`                                                      | `check -c <candidate>/<name> -D <base>`         |
| a single `-C` equal to `-config-dir`                                                                     | `check -C <candidate> -D <base>`                |
| anything else: a foreign file, several, `-c` and `-C`, a relative path with an unknown working directory | refusal before the write, `409 launch_mismatch` |

The `-D` path base:

- the working directory matches the config directory or is unknown: the candidate itself; it carries every file and subdirectory of the config directory in the same layout;
- the working directory is different and the apply has no list files: the service working directory, since the transaction does not change it and `check` sees the same base as the runtime. If the directory does not exist on disk, again the candidate: sing-box creates a non-existent `-D` itself, and the check must leave no traces before the write;
- the working directory is different and the apply writes list files: the existing `409 workdir_mismatch` refusal (ADR-0033).

Mandatory rules:

- The candidate is laid out the same way in both modes (the config, every neighbouring file, subdirectories): in `-c` mode the binary simply does not merge the neighbouring `.json`, but still resolves certificates, keys and rule sets by relative paths from `-D`.
- The `launch_mismatch` refusal does not expose the paths of the service command: they go to the daemon log at `Warn` level. The panel shows text by code.
- An unavailable procd does not stop the apply: a warning goes to the log, and the check runs in the fallback mode.
- The test bench script `apply-cycle-check` checks that the service is run with a single `-c` on the test bench config, and checks the candidate with the same command as the daemon.

Non-goal: managing a service not owned by the fork's package (another init script, a foreign `conffile`); such an installation gets `launch_mismatch`, not support.

### Scope and boundaries

`apps/metaboxd/internal/procd` (command parsing), `internal/singbox` (`Check`, `Launch`), `internal/apply` (mode selection, `LaunchError`), `internal/httpapi` and `internal/contract` (the `launch_mismatch` code), the panel: the refusal text, the test bench: `apply-cycle-check`. The rest of the ADR-0002 protocol does not change.

The decision supersedes the "Subject of validation before writing" section of ADR-0002 and removes the assumption "the service runs in directory mode" from the context of ADR-0008 and ADR-0033: service files outside the config directory and temporary names not ending in `.json` stay, since the service may also run in directory mode.

## Consequences

### Positive

- `check` judges the same command procd will run: neighbouring `.json` files give neither a false green check nor a false refusal in package mode.
- A service on a foreign config is discovered before the write by a refusal with a code, not by downtime and automatic rollback.
- An apply without list files with the package `workdir` is checked from the same path base as the runtime.
- Directory mode, if the owner keeps it, works as before.

### Negative

- One more state branch: the check depends on the procd answer, and it has two modes and a fallback path, so more tests and more ways to diverge from the test bench.
- A new contract code `launch_mismatch`: a panel older than the daemon shows it as an unknown refusal.
- Without the service command (disabled, no procd) the mode is guessed from the fork's package: a directory mode installation whose service has not run yet is checked as a single file.
- A service under another owner (for example, routing through a third-party dataplane with its own config file) gets a refusal, not support.

### Neutral or deferred

- A hint in the panel on how to point the service `conffile` at the daemon's config is not made: the refusal text and the log are enough while no such installations are seen.
- Several `-c` and a mixed mode are not supported: the fork's package does not produce them.

## Risks and mitigations

| Risk                                                                       | Probability and impact                            | Mitigation                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The fork changes the init script command (flags, order, long forms)        | Low, high impact: a false Apply refusal           | The parser accepts all forms of sing-box flags; `apply-cycle-check` on the test bench fails at step 8 on a mismatch |
| procd returns the command of a crashed instance while UCI is already fixed | Low, low impact                                   | procd updates the command on the next `restart`, which Apply itself performs; the refusal names the reason          |
| The owner keeps the service on a different `conffile` on purpose           | Medium with third-party dataplanes, medium impact | A `launch_mismatch` refusal before the write instead of writing to a file the service does not read                 |

## Compatibility, migration and rollback

No migration is needed: on a package installation and on the test bench only the `check` command changes. The contract is extended with the `launch_mismatch` code in the `ErrorCode` enumeration; a panel of the previous version shows it with the daemon's fallback text.

Rollback: return `check -D <candidate> -C <candidate>`; the consequences from the context come back with it.

## Validation

- `cd apps/metaboxd && go test ./internal/procd/`: parsing `-c` and `-C` in all forms, a repeated flag, a relative path from the working directory, a command without flags as `config.json`, a flag value that looks like a flag, stopping at `--`.
- `go test ./internal/singbox/`: `Check` calls `check -D <base> -c <file>` or `check -D <base> -C <directory>`; `Launch` takes the command from procd by the init script name.
- `go test ./internal/apply/`: an unknown command, a package file with the package working directory, a working directory that does not exist on disk, a file with the config working directory, directory mode: a check with the right mode and base; a foreign file, a command without flags on a foreign working directory, a relative file without a working directory, several files, a file and a directory at once: `LaunchError` without a single transaction step.
- `go test ./internal/httpapi/`: `LaunchError` returns `409 launch_mismatch` without paths in the body.
- `make schema-daemon`: the `launch_mismatch` code appears in `apps/web/src/shared/api/daemon.generated.ts`; without a text in `apps/web/src/shared/api/failureText.ts` the panel does not build.
- `make apply-check` on the test bench: step 8 sees `-c /etc/sing-box/config.json` without `-C`, step 9 checks the candidate with the same command.

## Links

- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): the Apply protocol; its section on the subject of validation is superseded;
- [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md): the working directory check for list files;
- [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): the test bench on the fork's package;
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md): calling `sing-box` and the service through procd;
- `apps/metaboxd/internal/procd/procd.go`, `internal/singbox/singbox.go`, `internal/apply/apply.go`, `internal/apply/cycle.go`;
- [`.devcontainer/target/files/usr/bin/apply-cycle-check`](../../.devcontainer/target/files/usr/bin/apply-cycle-check);
- `release/config/openwrt.init` of the fork [sing-box-extended v1.14.0-extended-2.7.1](https://github.com/shtorm-7/sing-box-extended/blob/v1.14.0-extended-2.7.1/release/config/openwrt.init).
