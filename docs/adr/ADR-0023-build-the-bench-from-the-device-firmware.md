# ADR-0023. Build the test bench from the target device image and install the panel as a package

- Status: Accepted
- Date: 2026-09-17
- Deciders: repository owner

## Context and problem statement

The `.devcontainer/` test bench stands in for the router: it is where the Apply cycle, service behaviour and panel reachability are checked. Before this decision it was built on the public `openwrt/rootfs:aarch64_generic-24.10.8` — the 24.10 branch with opkg, whereas the device ([ADR-0042](./ADR-0042-target-the-bpi-r4-pro-and-build-for-aarch64-only.md)) runs its own OpenWrt SNAPSHOT r35944+4 build, target `mediatek/filogic`, arch `aarch64_cortex-a53`, package manager apk 3.0.5.

The mismatch was not only in the base. The panel was not installed on the test bench but mounted as a binary from `dist/` and started by a bench init script with a hard-coded address; the package init script from [`apps/metaboxd/package/`](../../apps/metaboxd/package/), which reads UCI and takes addresses from networks, had never run. sing-box was unpacked from a tar.gz, so its init script was a bench copy too — with a `check` command that the fork package does not have. The network subsystem was disabled entirely: `/etc/config/network` held only loopback.

Because of this three acceptance criteria were blocked by the test bench: AC-14, AC-18 and AC-29. Shipping the panel as a package ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)) was accepted but not implemented — there was nothing to build the package with and nowhere to check it.

In scope: what the target environment image is built from, how sing-box and the panel get into it, which networks come up. Out of scope: building sing-box (the ready fork package is used), panel authentication, the content of the fw4 rules themselves on the device.

## Decision drivers

1. **Match with the device** in OpenWrt branch, arch, package manager and the way services start.
2. **Testable delivery**: what ships to the router must be checked by the test bench, not built by separate code.
3. **Works in CI**, which has its own architecture and no time for emulation: the integration run must stay reproducible.
4. **Reproducible build**: the image is built by a command from the repository, without manual steps and without the OpenWrt SDK.
5. **Fit for development**: the panel must open from the owner's machine, and a code change must not require rebuilding the whole image.

## Considered options

1. **Keep the public rootfs and grow it with settings.** Advantages: nothing needs to change, the image is pulled from the network, CI and the test bench are the same (drivers 3, 4). Disadvantages: the branch and package manager stay foreign (driver 1), package installation cannot be checked anywhere — 24.10 has no apk (driver 2), and the behaviour of the target file system is not reproduced at all. **Rejected.**

2. **Build the base from the device image from downloads.openwrt.org, install sing-box and the panel as apk packages, keep the public rootfs of its own arch for CI.** Advantages: the test bench matches the device in target, arch and apk (driver 1); the panel is installed from the same package that ships to the router, and the same build stage builds it (driver 2); CI keeps working on the public image of its architecture (driver 3); the image is built by `make stand-base`, the package by `make package`, no external files or SDK are needed (driver 4). Disadvantages: the test bench has two bases that must be kept working, and the device image version becomes one more pinned value. **Chosen.**

3. **Build the base from firmware the owner keeps locally.** Advantages: a match with the device down to its own SNAPSHOT build. Disadvantages: the build depends on a file outside the repository and on a variable with its path, this path does not exist in CI, and for a new person the test bench does not build at all (drivers 3, 4). **Rejected:** the owner's separate build differs from the official image by revision, not by what the test bench checks — the set of services, apk and the root layout.

## Decision outcome

The target environment of the test bench is built from the target device image, and the panel and sing-box get into it as packages.

Mandatory rules:

- **The base is built by a separate target.** `make stand-base` downloads the device sysupgrade image from downloads.openwrt.org, extracts the root from it and makes an image; the ready image is passed to the test bench via `METABOX_BASE_IMAGE`. The image URL is pinned in `DEVICE_IMAGE_URL`.
- **The root is found by magic, not by offset.** In a sysupgrade image the kernel data and dtb are placed outside the FIT tree, the tree has no separate root entry, and squashfs is appended right after. OpenWrt does not publish the root for this target as a separate archive.
- **The board in the image does not matter.** The kernel and dtb from the image are not used — the container runs on the host kernel — so an image of any board of the same target fits, and the one with a pinned release version is taken.
- **The fallback base is the public OpenWrt rootfs of the same branch.** Without the variables set, the test bench is built on it; CI uses only this path.
- **sing-box is installed as the fork package** for the arch the base itself declares (`/etc/apk/arch`). No bench copies of its init script and settings remain.
- **The panel is installed as an apk package** built from [`apps/metaboxd/package/`](../../apps/metaboxd/package/) and the `make daemon-device` binary. The package for the device and the package for the test bench are built by the same build stage; `make package` exports its result.
- **The network subsystem works.** netifd brings up the wired, guest and external networks; the panel takes addresses from the networks in `listen_interface`, as on the device. Network roles are determined by addresses, not by interface names: Docker hands out `eth*` names in arbitrary order.
- **Docker isolates the external network, not fw4.** The network is declared `internal`, it has no route to the other test bench networks. The wired network is declared first by priority: the container is created with it, and the port forwarded to the host arrives at its address.
- **By default the panel is served from the daemon binary.** The dev server with HMR comes up as a separate mode and presents itself to the daemon as the daemon, so there is no Origin leniency on the test bench.

Deliberately deferred: fw4 rules on the test bench, target file system behaviour on power loss, a SNAPSHOT image for `aarch64_cortex-a53` for CI — OpenWrt does not publish such a docker image.

### Scope and boundaries

The decision covers [`.devcontainer/`](../../.devcontainer/), the test bench and delivery targets in [`Makefile`](../../Makefile) and the integration run in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). It does not touch the daemon and panel code, except the dev server proxy, which now passes the daemon its own Origin.

## Consequences

### Positive

- The owner's test bench matches the device in branch, arch, package manager and the way services start.
- Panel delivery is no longer unchecked: the package is built and installed on every test bench start.
- Package init scripts and UCI settings run instead of lying as dead weight; the mismatch between the bench and the real sing-box start command is gone.
- Panel reachability across networks is checked by the `make reach-check` run.
- Dev mode no longer requires relaxing the Origin check in the daemon.

### Negative

- The test bench has two bases, and both must be kept working; the mismatch between CI and the device remains, it only moved to arch and branch.
- The device image version becomes one more value to bump by hand after the router.
- A bench script for network layout appeared, with no counterpart on the device.
- Rebuilding the image on a daemon change became mandatory: the binary is no longer mounted as a volume.

### Neutral or deferred

- The firewall is disabled on the test bench, and its rules are checked only on the device.
- AC-29 still requires a run on the device.

## Risks and mitigations

| Risk                                                                 | Likelihood and impact                                    | Mitigation                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The sysupgrade image format changes, and the root is no longer found | low, the base does not build                             | the build fails with an explicit error naming the image URL, the fallback path on the public rootfs keeps working |
| A fork release has no package for the base arch                      | low, the test bench does not build                       | the arch is taken from the base itself, the error shows at the download step; the package can be supplied locally |
| Docker changes how the forwarded port is delivered                   | medium, the panel does not open from the owner's machine | the receiving network is pinned by priority, and the address list is edited in one UCI file of the test bench     |

## Compatibility, migration and rollback

The migration is one-off: `make stand-base` builds the base, `make up` rebuilds the test bench. No external files are needed — the image is downloaded from the network. The old bench copies of the panel init script and the network configuration are removed, the volume with the sing-box config survives the transition. Rollback: point `METABOX_BASE_IMAGE` back at the public image: the test bench builds via the fallback path without firmware.

## Validation

- `make stand-base` and `make up` — the test bench comes up on the base from the device image;
- `make apply-check` — the Apply cycle passes entirely;
- `make reach-check` — the panel answers from the wired and guest networks and does not answer from the external one;
- `make package` — the panel package builds and contains `/usr/bin/metaboxd`, the package init script and UCI settings;
- `make up-dev` — the dev server comes up, a mutating request through it passes without Origin leniency;
- the CI integration run — the same checks on the public image.

## Links

- [ADR-0042](./ADR-0042-target-the-bpi-r4-pro-and-build-for-aarch64-only.md) — the target device;
- [`docs/PRD.md`](../PRD.md), criteria AC-14, AC-17, AC-18, AC-21, AC-22;
- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md) — shipping the panel as an apk package;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) — config ownership and the Apply protocol;
- [`.devcontainer/target/Dockerfile`](../../.devcontainer/target/Dockerfile), [`.devcontainer/target/device-base/Dockerfile`](../../.devcontainer/target/device-base/Dockerfile), [`.devcontainer/docker-compose.yml`](../../.devcontainer/docker-compose.yml).
