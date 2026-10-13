# ADR-0042. Target the Banana Pi BPI-R4 Pro and build v1 for aarch64 only

- Status: Accepted. The decision was made on 2026-08-30 in section A.7 of [`../PRD.md`](../PRD.md) and moved here without changes in substance
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.7 of [`../PRD.md`](../PRD.md)

## Context and problem statement

OpenWrt runs on devices ranging from weak mips routers with megabytes of flash to boards with gigabytes of memory. The target hardware determines the daemon's language and size, the resource budget, the set of build architectures and what the test bench is checked on.

The owner's answer in interview `metabox-di-001`, Round 11: "Banana Pi BPI-R4 Pro, the only device, we target it. Ideally, support low-power devices later if the community asks for it."

In scope: the target device and the v1 build architecture. Out of scope: the package format ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)) and the test bench setup ([ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md)).

## Decision drivers

- The project is run by one person for their own router (risk R-6).
- The architecture must not require a rewrite for weak hardware later: the NFR-2, NFR-4 and NFR-5 thresholds are set with this in mind.
- The cost of building and checking on each supported platform.

## Considered options

1. **A range of OpenWrt devices, including weak and mips ones.** A wider audience, but each architecture means its own build and its own checks, and the flash limit puts pressure on the size of a binary with an embedded SPA. Deferred until the community asks (roadmap after v1). **Rejected for v1.**
2. **One device, the BPI-R4 Pro; one architecture, aarch64.** **Chosen.**

## Decision outcome

The v1 target hardware is the **Banana Pi BPI-R4 Pro** (MediaTek MT7988A, aarch64, 8 GB RAM, NVMe/eMMC). There are no resource constraints of the "will it fit in flash" kind. The only target build architecture of v1 is **aarch64**.

### Scope and boundaries

- The binary for the device is built by `make daemon-device`: `GOOS=linux GOARCH=arm64 CGO_ENABLED=0`.
- The device firmware is a custom OpenWrt SNAPSHOT build with the apk package manager; this is where the package format in [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md) and the test bench base in [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md) come from.
- The NFR-2, NFR-4 and NFR-5 thresholds remain guidelines for weak hardware, although on the BPI-R4 Pro they are met with a margin.

## Consequences

### Positive

- The size of the binary with an embedded SPA and the choice of Go are not limited by flash.
- Building and checking happen on one platform; the test bench reproduces the device's branch, target, architecture and package manager, but not its own SNAPSHOT build ([ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md)).

### Negative

- Behaviour on other devices is not checked. The device's root layout for directory `fsync` is not checked.
- Support for mips and weak hardware will require a new build architecture and NFR measurements on it.

### Neutral or deferred

- Weak hardware and mips are a roadmap item after v1, if the community asks for it.

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since the start of the project and is moved from the PRD without changes in substance.

## Validation

- `make daemon-device` builds a binary for `linux/arm64`; `make package` packages it for the device.
- AC-35…AC-37 are confirmed by running the daemon on the BPI-R4 Pro.

## Links

- [`../PRD.md`](../PRD.md): section 9, NFR-2, NFR-4, NFR-5, risk R-6, the roadmap after v1, section A.7 (superseded by this ADR);
- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md), [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md);
- [`../../Makefile`](../../Makefile): the `daemon-device` target.
