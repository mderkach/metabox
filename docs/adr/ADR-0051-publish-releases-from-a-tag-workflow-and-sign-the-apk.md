# ADR-0051. Publish releases from a tag workflow and sign the apk package with the project key

- Status: Proposed
- Date: 2026-10-14
- Deciders: repository owner
- Supersedes: the "package is not signed" rule of [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md); the rest of ADR-0011 stays in force

## Context and problem statement

The panel ships as an apk package ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)) versioned from the `VERSION` file ([ADR-0050](./ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)). ADR-0050 deferred git tags and release publishing. Until now the package was built by `make package` on the developer's machine, from a local `.devcontainer/.env` and a base image made from the device firmware. No tag was checked against `VERSION`. The package was unsigned and installed with `apk add --allow-untrusted`, so a file changed on the way to the router went unnoticed.

ADR-0011 left the package unsigned on the premise that OpenWrt signs the repository index, not single packages, so a signed file gives nothing. A check on 2026-10-14 refutes this for installing from a file. It ran on `openwrt/rootfs:aarch64_generic-25.12.4`, the OpenWrt branch of the router:

- a package signed with an unknown key: `ERROR: UNTRUSTED signature`;
- the same package with its public key in `/etc/apk/keys`: installed;
- the same file with one byte changed: `ERROR: file format is invalid or inconsistent`.

Constraints:

- the router's arch is `aarch64_cortex-a53`, and apk installs only a package of the device's arch;
- Docker Hub has no `openwrt/rootfs` for `aarch64_cortex-a53`, only `aarch64_generic`;
- the build takes from the base image only the arch string (`/etc/apk/arch`) and runs `apk mkpkg` in alpine on the build platform, so no emulation is needed;
- `main` accepts changes only through a PR with green CI.

Out of scope: a package repository with a signed index, auto-update of the panel, other architectures.

## Decision drivers

1. A package changed on the way, or signed by someone else, does not install on the router.
2. The published package and its version cannot diverge from `VERSION` and the tagged commit.
3. The private key stays out of git, build logs, image layers and the router.
4. The release builds without the owner's machine and the firmware image.
5. No new dependencies in the daemon or frontend, and the local test bench build keeps working as before.

## Considered options

1. **A workflow on `v*` tags, the package signed with the project's ECDSA key.** `apk mkpkg --sign-key` signs the package; the private key is the `APK_SIGN_KEY` repository secret and reaches the build only as a BuildKit secret. The public key is committed and installed on the router once. The arch is set explicitly through `PKG_ARCH`. Drawbacks: the owner keeps a key pair and replaces the public key on every router if the private one is lost or leaks; the one-time key install is a manual step. **Chosen.**
2. **No signature, only a sha256 file in the release.** Simpler, no secret. Drawbacks: whoever replaces the package can replace the sum next to it, and apk still needs `--allow-untrusted`, which also accepts any other unsigned package. **Rejected:** fails driver 1.
3. **A detached signature (usign or openssl) next to the package.** Drawbacks: apk does not check it, so verification becomes a manual step before `apk add`, which gets skipped. **Rejected.**
4. **A package repository with a signed index right away.** Gives `apk upgrade` and dependency resolution. Drawbacks: needs hosting reachable by the router without a token and a decision on pre-releases (`releases/latest` does not point to them); the router is one so far. **Deferred**: this option builds on the key of option 1.
5. **Build in CI on the firmware image, as the local build does.** The arch comes from the image itself. Drawbacks: downloading and unpacking the firmware image (about 100 MB) on every release only to get one arch string. **Rejected.**
6. **Keep building by hand.** Fails drivers 1, 2 and 4. **Rejected.**

## Decision outcome

- A release is a `v*` tag on a commit in `main`. The [`release`](../../.github/workflows/release.yml) workflow fails if the tag is not `v` plus `VERSION`, if `apps/web/package.json` declares another version, if the tagged commit is not in `origin/main`, if `keys/metabox-release.pem` is missing, or if the `APK_SIGN_KEY` secret is empty.
- The workflow runs `make package` with `PKG_ARCH=aarch64_cortex-a53` on the public `aarch64_generic` rootfs of the same branch, and with `APK_SIGN_KEY` pointing to the key file.
- Before publishing, the workflow checks the signature against the committed public key with `apk verify`. A secret that does not match the published key fails the release.
- The GitHub Release holds `metaboxd-<apk version>.apk`, its `.sha256` file and the public key. A version with a pre-release suffix is published as a prerelease.
- The key is ECDSA `prime256v1`. The private key is only the repository secret, and the [`Dockerfile`](../../.devcontainer/target/Dockerfile) gets it only as the BuildKit secret `apk_sign_key`, never as a build arg.
- The public key is put on the router once, in `/etc/apk/keys/metabox-release.pem`. After that, release packages install without `--allow-untrusted`.
- Without `PKG_ARCH` and `APK_SIGN_KEY`, `make package` builds as before: the arch of the base image, no signature. The test bench and local builds stay unsigned.

## Consequences

### Positive

- A package that was changed, or signed by another key, is rejected by apk on the router.
- The published package and its version are tied to a tag on `main` and to `VERSION`.
- A release does not depend on the owner's machine, `.devcontainer/.env` or the firmware image.

### Negative

- The owner keeps a key pair. Losing or leaking the private key means a new pair and replacing the public key on every router.
- The first install of the key on a router is manual, and trust in that key comes from fetching it over HTTPS from the repository.
- The release package is built on a different base than the one checked in the test bench. Only the arch string differs, but the first CI package has not been installed on the router yet.
- Updating is still downloading a file and running `apk add` with an explicit path.

### Neutral or deferred

- A package repository with a signed index, and pre-release delivery through it: a separate decision.
- Key rotation without manual steps, for example a keys package, is not addressed.

## Risks and mitigations

| Risk                                                 | Likelihood and impact | Mitigation                                                                                         |
| ---------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| The secret and the committed public key do not match | Low, release fails    | `apk verify` against the committed key before publishing                                           |
| The package from the public rootfs does not install  | Low, medium impact    | `PKG_ARCH` sets the router's arch; the first release is checked on the router before relying on it |
| The private key leaks through the build              | Low, high impact      | BuildKit secret mount: not in build args or layers; the output stage holds only the package        |

## Compatibility, migration and rollback

Already installed packages are not affected. The router has the unsigned `metaboxd 0.1.0_rc2-r0`. A signed package of a higher version replaces it with `apk add` once the public key is installed. Rollback: delete `release.yml`, drop `PKG_ARCH` and `APK_SIGN_KEY` from the `Makefile` and the `Dockerfile`, and go back to `--allow-untrusted`. Signed packages keep installing as long as the public key stays on the router.

## Validation

- `make package PKG_ARCH=aarch64_cortex-a53 APK_SIGN_KEY=<key>`: `apk adbdump` shows `arch: aarch64_cortex-a53`; `apk verify --keys-dir <dir with the public key>` prints `OK`; without the key it prints `UNTRUSTED signature`.
- `make package` without the variables: the arch of the base image, `apk verify` prints `UNTRUSTED signature` with any key.
- `actionlint .github/workflows/release.yml` reports nothing.
- A test tag that differs from `VERSION` fails the "Tag matches the version" step.
- On the router, after the key is installed: `apk add /tmp/metaboxd-<version>.apk` without `--allow-untrusted` succeeds.

## Links

- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md): delivery as an apk package;
- [ADR-0050](./ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md): version from `VERSION`;
- [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): test bench base from the firmware image;
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`Makefile`](../../Makefile), [`.devcontainer/target/Dockerfile`](../../.devcontainer/target/Dockerfile);
- [`docs/Development.md`](../Development.md), section "Release": key generation and install;
- [apk-tools](https://gitlab.alpinelinux.org/alpine/apk-tools): `apk mkpkg`, `apk verify`.
