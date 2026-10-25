# ADR-0009. Read the service state from procd over ubus, leaving control to the init script

- Status: Accepted
- Date: 2026-09-11
- Deciders: repository owner

## Context and problem statement

The panel shows a sing-box service card: the state, the process age and the failure reason. The `GET /api/service` contract requires three states (`running`, `stopped`, `failed`) and the uptime.

The init script provides less. `/etc/init.d/<service> running` returns only an exit code: zero or non-zero. `/etc/rc.common` brings this command to every script with `USE_PROCD`, so the package does not need to declare it; checked on the device: `running` of a routing service whose script does not declare the command answers with zero. It provides neither the age, nor the difference between "stopped" and "failed", nor the failure reason. Before this decision the daemon always returned `uptime: 0` and did not distinguish `failed` from `stopped`.

Checked on the target device with `ubus call service list`: an instance has `running`, `pid`, `respawn`, `term_timeout`, `limits` and `command`. Neither the age nor the exit code is among them.

A separate difficulty showed up on the same router: `sing-box` was started twice, by another routing service and by the `sing-box` package's service. The "right" process cannot be found by the binary name: `pidof sing-box` returned two pids. Only procd knows which service a process belongs to.

The constraint was set earlier: [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md) requires controlling the service only through the init script: "starting the binary directly, `kill` by pid and editing `/etc/rc.d` are forbidden: procd owns the process, restarts it by `respawn` and does not know about outside interference".

In scope: where the daemon gets the process age and the failure flag. Out of scope: service control, showing logs and the content of the failure reason.

## Decision drivers

1. **Control stays with the init script**: the DeviceIO constraint is not weakened.
2. **The process is identified unambiguously** even when one binary is started by several services.
3. **Independence from the device clock**: the router has no real-time clock.
4. **A missing source does not break the panel** (NFR-1): without data the screen degrades instead of failing.
5. **Zero new dependencies in the module**: the daemon's `go.mod` stays without `require`.

## Considered options

1. **Leave as is.** Pros: zero work. Cons: the uptime is always zero, and a failed service cannot be told apart from a stopped one, which is exactly the case for which the user opens the card. **Rejected.**

2. **Find the process by the binary name.** `pidof` or walking `/proc` with a name filter. Pros: no ubus needed. Cons: on the target router this already gives two pids from different services (driver 2); picking "the first one found" would show the age of someone else's process. **Rejected.**

3. **Extend the init script with our own `status` command.** Pros: one source, everything through the init script. Cons: the script then came with another package, not with the panel, so our own command could not be added there; that package does not even have `check`. **Rejected.**

4. **Ask procd over `ubus`, compute the age from `/proc`.** Pros: the owner answers which service a process belongs to (driver 2); the age is counted from system boot and does not depend on the clock (driver 3); `ubus` is procd's regular interface, not a way around it (driver 1); JSON parsing and reading a file are in the standard library (driver 5). Cons: one more external call and parsing of its output; on a system without procd the source is missing. **Chosen.**

## Decision outcome

The daemon calls `ubus call service list` and finds the service by the name derived from the init script path: procd registers the service under the script's name. The path to `ubus` comes from the `-ubus` flag, like the other paths: `PATH` under procd is not the same as in an interactive shell.

**Reading and control are separated.** Service control is still only `start`, `stop`, `restart` through the init script. The DeviceIO constraint is not weakened: the `pid` from procd is used only to find out the process age, and never to stop or restart it.

**The age is counted from system boot.** `starttime` (the start moment in ticks since boot) is taken from `/proc/<pid>/stat` and subtracted from `/proc/uptime`. Absolute time does not fit: the device starts from the epoch and jumps on NTP sync. The process name in `stat` is in parentheses and may itself contain spaces, so the fields are counted from the closing parenthesis, not from the start of the line.

**The three states are derived as follows:**

| State     | How it is determined                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `running` | the init script returned zero                                                                           |
| `failed`  | the init script returned non-zero, but procd knows the service: it was started and the instance dropped |
| `stopped` | the init script returned non-zero, and procd does not remember the service                              |

**An unavailable source does not break the response.** No `ubus`, no procd, no `/proc`: the state comes down to the init script's exit code, the age stays zero, and the panel shows it as a dash. A failed poll does not turn into a failed endpoint: the screen must open even with the service down (NFR-1).

**The failure reason is not taken from here.** Neither procd nor the init script returns the exit code or the failure text; the contents of the `ubus` response confirm this. The `lastError` field stays empty until a log source appears; the log screen is moved to the roadmap after v1, and the decision on it is separate.

### Scope and boundaries

The decision covers `internal/procd` and `internal/singbox`. The apply protocol, config ownership and serving the panel are not affected.

## Consequences

### Positive

- The age and the failure flag appear without weakening the constraint on service control.
- The process is identified unambiguously on a device where one binary is started by two services.
- No new dependencies: JSON parsing and file reading come from the standard library.

### Negative

- The daemon depends on the external `ubus` utility and its output format. On a system without procd the source is simply missing, but on OpenWrt a format change would break the age silently; this is caught by a parsing test, not at runtime.
- The service name is derived from the init script name. This is a procd convention, not a guarantee: a service registered under a different name gives `stopped` instead of `failed`.
- `USER_HZ` is assumed to be 100. This is true on aarch64 and on the other common architectures too, but the value cannot be obtained from Go without cgo, and `sysconf` would pull in a dependency. On a system with a different `USER_HZ` the age will be off by a factor.
- `lastError` stays empty: the contract declares the field, but it has no source yet.

### Neutral or deferred

- The failure reason text and the log screen are a separate task after v1.
- The panel's own age is not needed in the contract: the daemon already returns its version in `GET /api/status`.

## Risks and mitigations

| Risk                                                                    | Likelihood and impact | Mitigation                                                                                                                           |
| ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The `ubus` output format changes                                        | Low, low impact       | Parsing is covered by a test on a recorded response; on a mismatch the age is zeroed, and the state still comes from the init script |
| `/proc` is unavailable or trimmed                                       | Low, low impact       | The age is zeroed, and the response keeps coming                                                                                     |
| The service is registered in procd under a name other than the script's | Low, medium impact    | A failed service shows as stopped; the behaviour is worse but not false: control and the `running` state are not affected            |

## Compatibility, migration and rollback

No migration is needed: the `-ubus` flag has a device default, and without procd the daemon works as before. The `GET /api/service` contract gains field values; the set of fields stays the same.

Rollback: remove the procd dependency from the service client. The response goes back to the init script's exit code, and `uptime` becomes zero again.

## Validation

- On a device with sing-box running, `GET /api/service` returns a non-zero `uptime`, and it is consistent with the time of the last config apply.
- On a device where one binary is started by two services, the age matches the process of the right service, not the first one found.
- A daemon started with `-ubus` pointing to a nonexistent path keeps answering: the status comes from the init script, `uptime` is zero.
- A service known to procd but not running gives `failed`; an unknown one gives `stopped`.

## Links

- [PRD](../PRD.md): AC-16, AC-27, NFR-1;
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md): service control through procd;
- [ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md): the panel's runtime data sources.
