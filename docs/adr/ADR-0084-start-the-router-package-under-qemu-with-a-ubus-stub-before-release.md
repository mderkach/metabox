# ADR-0084. Start the router package under QEMU with a ubus stub before a release and on every PR

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner

## Context and problem statement

The release workflow builds the router package for `aarch64_cortex-a53`, checks its signature against `keys/metabox-release.pem` and its arch field, and publishes it ([ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md)). The published binary is never started. The CI integration job runs the bench on `x86-64` ([ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md)), so a package that installs but whose aarch64 binary does not start, or an init script that hands procd a broken command, reaches the router unnoticed.

Constraints already set:

- GitHub runners are amd64; there is no public OpenWrt rootfs for `aarch64_cortex-a53`, only `openwrt/rootfs:aarch64_generic` of the same branch, which the local bench already uses.
- The bench target container runs procd as init and needs a privileged container and its own networks; under emulation that is a full bench, not a check of one package.
- The daemon has no `-version` flag; adding one changes its command line, which is out of scope.

Out of scope: the router itself, rotation of the signing key, and starting `sing-box`.

## Decision drivers

- A release fails when the published aarch64 binary does not start.
- The check runs on the exact signed package that is published, not a rebuild.
- A failure of the check itself is seen before a tag: the release workflow is taken from the tagged commit, so a fix after a failed release needs a new tag.
- Cost in CI minutes and in new external dependencies.
- No change to product behaviour.

## Considered options

1. **Install the package in the aarch64 rootfs under QEMU user-mode emulation, replace `ubus` with a stub, run the command the init script hands procd and read `/healthz`**: covers the package install with the router arch and signature, the init script up to the procd hand-off, and the daemon start with the init script's arguments. Does not cover procd itself. Needs `docker/setup-qemu-action` and the `tonistiigi/binfmt` image. **Chosen.**
2. **Start the full bench (procd as init) on the aarch64 base under QEMU**: also covers procd respawn and the service state. The bench builds its own package from a binary instead of taking the published one, needs a privileged container with three networks, and the whole bench under emulation is several times slower than the package check. **Rejected**: it checks a rebuild, not the published package, for a large cost.
3. **Run `metaboxd -version` (or `-h`) from the package without installing it**: the cheapest check that the binary starts. It misses the install, the dependencies and the init script, and `-version` does not exist. **Rejected.**
4. **Keep the current approach**: the arch field and the signature are checked; the binary is never run. **Rejected**: this is the gap being closed.

Where the check runs:

- **Only in the release workflow**: no PR cost, but QEMU on the runner is first exercised on a real tag. **Rejected** by the owner.
- **In the release workflow on the signed package and in a `package` CI job on an unsigned package built the same way on every PR**: about one extra parallel job per PR. **Chosen.**

## Decision outcome

`.github/scripts/package-smoke.sh <package.apk> [public-key.pem]` is the single check, run by both workflows:

- it downloads `sing-box-extended` for `aarch64_cortex-a53` and verifies it against `sing-box-extended.sha256`;
- in `openwrt/rootfs:aarch64_generic-<branch>` it adds `aarch64_cortex-a53` to `/etc/apk/arch`, installs the fork package, then installs the panel package; with a key, apk verifies the signature, without one it is skipped;
- it requires `/usr/bin/metaboxd` to be an aarch64 ELF, because the amd64 runner starts an amd64 binary natively;
- it replaces `ubus` with a stub, sets `listen_addr` to `127.0.0.1`, runs `/etc/init.d/metaboxd start` and takes the `metaboxd` instance command;
- it starts that command and requires `/healthz` to report the version from `VERSION`.

`release.yml` runs it after "Verify and name the package" with `keys/metabox-release.pem`. The `package` job in `ci.yml` builds `make package PKG_ARCH=aarch64_cortex-a53` and runs it without a key; `checks` depends on that job.

`docker/setup-qemu-action` is pinned by commit SHA, its `tonistiigi/binfmt` image by digest, and its Actions image cache is off.

Non-goals: procd respawn, the network reload triggers, listen addresses from netifd, the `metabox-singbox` service, `post-upgrade`.

## Consequences

### Positive

- A package whose binary is for the wrong arch, crashes at start, or reports another version does not get published.
- The init script is checked up to the command it hands procd, with the default UCI settings from the package.
- Emulation problems show up in PR CI, not on a tag.

### Negative

- Each PR spends one more parallel job: panel build, package build and an install under QEMU.
- Both workflows depend on GitHub releases of the fork and on `downloads.openwrt.org` for the kernel module dependencies; a release re-run that restores the saved bundle downloads them again.
- The check uses `aarch64_generic` userland with the router arch added to apk, not the router's own image.

### Neutral or deferred

- A `-version` flag in the daemon; `/healthz` already reports the version.
- Starting the full bench on aarch64 in CI.

## Risks and mitigations

| Risk                                                             | Likelihood and impact           | Mitigation                                                               |
| ---------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| The emulated start exceeds the 60 s health wait on a slow runner | low; blocks a release or a PR   | the PR job shows the timing on every run; the step timeout is 10 minutes |
| A false pass on an amd64 binary run natively                     | would hide a wrong-arch package | the ELF machine field is checked before the start                        |
| `downloads.openwrt.org` or GitHub is down                        | rare; blocks a release          | re-run the workflow when the source is back                              |

## Compatibility, migration and rollback

Not applicable to the product: no package, config or API change. Rollback is removing the two release steps and the `package` job with its entry in `needs` of `checks`.

## Validation

- `.github/scripts/package-smoke.sh`, the "Package installs and the daemon starts" step in `.github/workflows/release.yml`, the `package` job in `.github/workflows/ci.yml` and its entry in `needs` of `checks`.
- Locally: `make package PKG_ARCH=aarch64_cortex-a53` then `bash .github/scripts/package-smoke.sh dist/metaboxd.apk` prints `metaboxd <VERSION> started on aarch64 from the init script command`.
- Failing cases: a different public key gives `UNTRUSTED signature`; an amd64 daemon in the package gives `is not an aarch64 ELF`; a binary that exits gives `daemon did not report version`.

## Links

- [ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md): release workflow and package signing;
- [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): bench base and the public rootfs;
- [ADR-0054](./ADR-0054-run-ci-checks-as-parallel-jobs-behind-a-summary-job.md): CI jobs behind `checks`;
- [`docs/Maintaining.md`](../Maintaining.md): release steps;
- issue [#257](https://github.com/mderkach/metabox/issues/257).
