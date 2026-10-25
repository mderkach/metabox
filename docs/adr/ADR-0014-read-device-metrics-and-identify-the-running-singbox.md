# ADR-0014. Read device metrics from procfs and identify sing-box by the Clash API listener

- Status: Accepted
- Date: 2026-09-13
- Deciders: repository owner

## Context and problem statement

The panel showed the runtime only through what the Clash API returns: speed, sing-box heap memory, connections. Everything around it (whether the router CPU is loaded, whether the board is heating up, how much memory is left, how much of the link goes past the proxy at all) stayed behind SSH.

The second gap was more visible. On the target BPI-R4 Pro, routing is owned by another package: it starts `/usr/bin/sing-box` with its own service against a working config in its own directory under `/var/run/`. The daemon, however, asks procd about the state of `/etc/init.d/sing-box`, the sing-box package's service, disabled on 2026-09-11. The result on the live device: the screen showed active connections and ongoing traffic, and next to them the label "sing-box stopped" with a "Start" button that would have started a second copy of the process on top of the running one.

The constraints were set earlier: the daemon's `go.mod` has no dependencies ([Architecture and style guide](../../apps/metaboxd/docs/guides/Architecture&Style.md)), the NFR-4 budget (RSS ≤ 64 MB, idle CPU ≤ 1% of a core), service control only through the init script (PRD, Constraints).

In scope: where the daemon gets device metrics, how it identifies the running sing-box and what of this goes into the contract. Out of scope: storing the history of these metrics and charts deeper than a minute: they stay in the roadmap after v1.

## Decision drivers

1. **No new dependencies in the daemon.** Each of them goes into the single delivery artifact.
2. **Honest metrics.** The panel does not pass off a stopped service as a running runtime or vice versa.
3. **Idle cost.** Polling runs only while the panel is open and fits into NFR-4.
4. **Testability.** Reading the device must be testable without a live router.
5. **Partial degradation.** A board without a thermal zone, a device without a default route and a stopped sing-box must not kill the other metrics.

## Considered options

### Metrics source

1. **An external agent (collectd, netdata) and a request to it.** Pros: many metrics, no need to compute them. Cons: a package that may not be on the device, and a second point of failure; the memory cost is comparable to the daemon itself (drivers 1, 3). **Rejected.**

2. **`ubus` and `system info` calls.** Pros: the native OpenWrt path, already used for the service state. Cons: launching an external process every few seconds where reading four files is enough (driver 3); the field set is not defined by us and differs between builds. **Rejected.**

3. **Reading procfs and sysfs directly.** Pros: the standard library, and the file system roots are replaced with a fake tree in tests (drivers 1, 4); reading is cheap. Cons: the kernel file formats are parsed by hand, and differences between boards are caught only on the device. **Chosen.**

### Identifying the sing-box process

1. **Trust procd.** Pros: nothing to do. Cons: exactly the failure this decision is made for (driver 2). **Rejected.**

2. **Find the process by the binary name.** Pros: one read of `comm` per process. Cons: the device may have several sing-box processes, for example a disabled package service and a running service of another routing package, and the choice between them would be arbitrary (driver 2). **Rejected.**

3. **Find the process that listens on the Clash API port.** Pros: this is exactly the process whose data the panel shows; no other one is drawn by it (driver 2). Cons: procfs expresses the socket–process link only through links in `fd`, so the search walks the descriptors of all processes. **Chosen**; the walk is done once and cached by pid.

## Decision outcome

The `internal/device` package reads `/proc/loadavg`, `/proc/meminfo`, `/proc/uptime`, `/proc/net/dev`, `/proc/net/route`, `/proc/<pid>/status` and `/sys/class/thermal/*`. The `proc` and `sys` roots are fields of `Options`, so tests run against a tree in `t.TempDir()`, not against the live system.

The metrics go to the panel as the `system` topic of the same `GET /api/events` stream (ADR-0010) with a two-second step. The stream comes up only when there is a reader, so there is no polling when idle.

The sing-box process is found by the Clash API port listener: the port is taken from the applied config, the inode of the listening socket from `/proc/net/tcp` and `/proc/net/tcp6`, and the owner of the inode by walking `/proc/*/fd`. The found pid is remembered; before each next read it is checked against `comm`, because the system reuses a freed pid.

The same search answers the question "is the runtime alive": `contract.Service` got a `managed` field. The `running` status with `managed: false` means that sing-box is running but was not started by the daemon's service. In this case the panel shows the service as running and removes the control buttons: they refer to a different process.

The outward interface is chosen by the default route with the lowest metric, skipping tunnels: in TUN mode the default route belongs to sing-box itself, and its traffic would be both the numerator and the denominator. A tunnel is recognized by the `tun_flags` file, which the kernel creates only for TUN/TAP devices.

The share of the link going through sing-box is computed from increments over one window, not from accumulated counters: the interface counter runs from link up, the Clash API counter from process start, and dividing one by the other would give a number that means nothing. The daemon accumulates the increments: it reads the link counter itself and gets the sing-box counter with the connection snapshot. Accumulation on the client was rejected: the observation window would reset on a page reload, and the per-second ratio jumps with every burst (a pattern common among router panels: a ready ratio of targeted to total connections, with live values shown separately).

## Consequences

**Good:** device metrics do not require SSH; the panel stopped calling a running runtime stopped; the dangerous "Start" button disappeared where another service owns the process; reading is checked by tests without a router.

**Bad:** the kernel file formats are parsed by hand, and a board with a different set of `meminfo` fields or thermal zones will be discovered only on the device. Walking `/proc/*/fd` is the most expensive part of polling; it runs on the first search and after the process dies, but on a device with thousands of processes it is a noticeable one-time job.

**Open:** the age of another service's process is not shown: `/proc/<pid>/stat` knows it, but the contract field `uptime` is described as the service age, and two different ages must not be mixed in one field. The link share is computed over the whole interface: LAN-to-LAN traffic is not included, and proxy encapsulation makes the share slightly higher than the honest value.

## Validation

On the BPI-R4 Pro on 2026-09-13, the daemon from the branch against the working config of that other routing package: `GET /api/service` returned `{"status":"running","managed":false}` with the package service disabled; the `system` topic returned a load of 0.01 with four cores, a temperature of 42.8 °C, 355 MB of used memory out of 7.8 GB, a WAN link of 93.6 kB/s, a share through sing-box of 37%, a process RSS of 82.3 MB at pid 5872 (the Clash API at the same moment reported 45.8 MB: it counts only the Go runtime memory, without the binary's resident code), a daemon RSS of 14.2 MB and 23 goroutines. The `internal/device` tests pass on a fake procfs tree, including a pid reused by a foreign process and a default route through a tunnel.
