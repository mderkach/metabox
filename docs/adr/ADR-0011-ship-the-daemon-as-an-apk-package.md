# ADR-0011. Ship the daemon as an apk package, not ipk

- Status: Accepted
- Date: 2026-09-12
- Deciders: repository owner
- Superseded by: the "package is not signed" rule only, by [ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md) (Proposed)

## Context and problem statement

Section 9 of the PRD sets a single delivery artifact: a Go binary with embedded static files, packaged as ipk. The wording was written when ipk was the only OpenWrt format.

The target device ([ADR-0042](./ADR-0042-target-the-bpi-r4-pro-and-build-for-aarch64-only.md), BPI-R4 Pro) runs a custom OpenWrt SNAPSHOT r35944+4 build with the apk 3.0.5 package manager, measured on the device firmware on 2026-09-07. This manager does not accept ipk: the build has no opkg. OpenWrt replaced opkg with apk in the main branch and in the 25.12 release, which came out in March 2026; ipk stays the format of the 24.10 branch and older.

The mismatch has already happened in practice: the daemon was delivered to the device by hand, built with `make daemon-device` and with the files put in place. While delivery is manual, there is nothing to roll back, and an update is no different from the first install.

What exactly is shipped is known from the repository and does not depend on the format: the `metaboxd` binary in `/usr/bin`, the procd init script and the UCI settings from [`apps/metaboxd/package/`](../../apps/metaboxd/package/). The binary has no dependencies: the daemon's `go.mod` stays without `require`, and the build runs with `CGO_ENABLED=0` ([`Makefile`](../../Makefile), target `daemon-device`).

In scope: the package format and the way it is built. Out of scope: the package repository and its signing, auto-update of the panel, building sing-box: the fork binary is installed separately and is not managed by metabox.

## Decision drivers

1. **Installs on the target device** without workarounds: apk 3.0.5, SNAPSHOT.
2. **Builds in CI without the OpenWrt SDK.** The full SDK pulls in a toolchain and a build tree for three files that are already ready.
3. **Provides removal and update through the manager**, not "put the files back by hand": on a router this is the only way to know that the panel is installed and which version.
4. **Does not set up tooling for a user who does not exist.** A second format means a second build method, a second check and a second chance to diverge.
5. **Reversibility**: a failed install must not leave the device in a state that cannot be recovered over SSH.

## Considered options

1. **Keep ipk, as written in section 9 of the PRD.** Pros: the PRD wording does not change; an ipk is built with plain `ar` from two tar archives, without a toolchain. Cons: it does not install on the target device at all (driver 1), and that is the only device the panel runs on today. It only makes sense for the 24.10 branch and older, which the project has no users of yet. **Rejected.**

2. **An apk built with `apk mkpkg` from apk-tools 3.** Pros: the native format of the target OS (driver 1); building is one command over a ready file tree, no SDK needed (driver 2); the manager knows about the package, its version and files, and removal and update work normally (driver 3). Cons: the build environment needs apk-tools version 3, which a regular Linux machine does not have, so the build target has to run in a container; the package stays unsigned, and how apk on the device reacts to that has not been checked in the repository. **Chosen.**

3. **A tar.gz with an install script.** Pros: works on any OpenWrt branch and on the test bench, can be built with anything (drivers 1, 2). Cons: the manager does not know about the panel: no file list, no version, no removal (driver 3); the install script becomes our own code that nobody checks until it breaks on someone else's device. **Rejected as the main format, kept as a fallback for branches without apk.**

4. **Build both formats from one file tree.** Pros: covers both SNAPSHOT and 24.10. Cons: two build targets, two checks and two artifacts in the release for a branch nobody has run the panel on (driver 4); there is nowhere to check an ipk right now: the test bench has OpenWrt 24.10 with opkg, but the panel was never installed there. **Rejected for v1**; we come back to it when there is a request for 24.10.

## Decision outcome

The daemon ships as an apk package. The ipk format is not built in v1.

Mandatory rules:

- **The package content is the same tree that lives in the repository.** `apps/metaboxd/package/` plus the binary built by `make daemon-device` in `/usr/bin/metaboxd`. The package creates no files that are not in the repository.
- **The build does not require the OpenWrt SDK** and runs as a separate Makefile target in a container with apk-tools 3. The OpenWrt toolchain is not pulled into the panel build.
- **The package is not signed.** OpenWrt signs the repository index, not individual packages, so signing a single file gives nothing to either side.
- **The package does not touch the user's config.** `/etc/config/metabox` is installed as a conffile: an update does not overwrite the owner's edits, and `/etc/sing-box/config.json` does not belong to the package at all: the Apply protocol owns it ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)).
- **The service does not start by itself on install.** Starting is an explicit action: `/etc/init.d/metaboxd enable && /etc/init.d/metaboxd start`. The panel listens on the lan interface address, and a silent start on a device with an unexpected network layout would mean an open port the owner does not know about.

Deliberately deferred: a package repository with a signed index, auto-update of the panel, ipk for the 24.10 branch.

### Scope and boundaries

The decision covers the daemon's delivery artifact: `apps/metaboxd/package/`, the build target in the [`Makefile`](../../Makefile) and the release step in CI. It does not affect the Apply protocol, the config schema or the test bench.

## Consequences

### Positive

- The panel is installed on the target device with a regular command instead of placing files by hand.
- The manager knows the version and the file list: removal and update stop being manual operations, and `apk info` answers what exactly is installed.
- The build stays within the repository: the OpenWrt toolchain is needed neither in CI nor on a developer machine.

### Negative

- The package installs only on branches with apk: SNAPSHOT and 25.12 and newer. An owner of 24.10 is left with the fallback of unpacking the files by hand.
- The build environment needs a container with apk-tools 3: the Makefile target stops being self-sufficient on a machine without Docker.
- An unsigned apk package may require explicit consent on install. Until this is checked on the device, the install command is not recorded in the documentation.

### Neutral or deferred

- Section 9 of the PRD still names ipk. The requirement is edited when this ADR is accepted, not earlier: until then it stays in force.
- How exactly the panel will be updated on the device is a separate question; the package provides the mechanism for it, but the update policy is not chosen here.

## Risks and mitigations

| Risk                                                                             | Likelihood and impact | Mitigation                                                                                                                                     |
| -------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| apk on the device refuses to install an unsigned package                         | Medium, medium impact | Checked by the very first install; on refusal it is installed with explicit consent, and the command is recorded in the delivery documentation |
| The apk package format changes between apk-tools versions                        | Low, medium impact    | The package is built with the same apk-tools family that is on the device; a mismatch shows up on install, not at runtime                      |
| The build in the container diverges from what CI builds                          | Medium, low impact    | The Makefile target is the same locally and in CI; the image and the apk-tools version are set in it explicitly                                |
| Installing on a device with a different network layout opens a port unexpectedly | Low, high impact      | The service does not start on install; starting is an explicit owner command                                                                   |

## Compatibility, migration and rollback

There is nothing to migrate: there has been no package install so far, and the device has a copy of the files placed by hand. The first package install over the manual layout overwrites the same paths; by then the owner has stopped the service.

Rollback is to remove the package with the manager and, if needed, go back to the manual layout from `make daemon-device`. The daemon config in `/etc/config/metabox` survives removal as a conffile, and the sing-box config does not belong to the package.

## Validation

- The build target produces an `.apk` file, and its content matches the `apps/metaboxd/package/` tree plus the binary: the package file list is read with `apk info -L`, and it has no extra paths.
- Installing on the target device works without placing files by hand, and `apk info metaboxd` shows the installed version.
- After install the service is not running; after `enable` and `start` the panel answers on the lan interface address, as with a manual install (AC-17, AC-18).
- Updating the package over the installed one does not overwrite edits in `/etc/config/metabox`.
- Removing the package leaves neither the binary nor the init script, and `/etc/sing-box/config.json` stays in place.

## Links

- [PRD](../PRD.md): section 9 (delivery artifact), open question OQ-8;
- [ADR-0042](./ADR-0042-target-the-bpi-r4-pro-and-build-for-aarch64-only.md): target hardware;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): ownership of the sing-box config;
- [`apps/metaboxd/package/`](../../apps/metaboxd/package/): the procd init script and UCI settings;
- [OpenWrt 25.12: apk instead of opkg](https://linuxiac.com/openwrt-25-12-released-with-apk-package-manager-replacing-opkg/);
- [openwrt: package: do not sign individual APK packages](https://lists.infradead.org/pipermail/lede-commits/2025-October/027374.html).
