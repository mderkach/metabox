# ADR-0050. Version releases by semver from the VERSION file and derive the apk package version from it

- Status: Accepted
- Date: 2026-10-11
- Deciders: repository owner

## Context and problem statement

Before this decision the project had no version. The daemon binary was built with `VERSION ?= dev` (`Makefile`), the panel package with `PKG_VERSION ?= 0.0.0-r0`, the frontend declared `"version": "0.0.0"`, and there were no git tags. The first package for the router was built with a one-off command line parameter `PKG_VERSION=0.1.0-r0`. So the router has the package `metaboxd 0.1.0-r0`, while the daemon answers `"version":"dev"` in `GET /api/status`, and the panel gives no way to tell which build is installed.

The owner declared the next build a release candidate and asked to version it by semver, taking apk specifics into account. The package is installed by apk-tools (ADR-0011), and its version format does not match semver:

- apk does not accept a hyphen inside a version: it separates the package revision number (`-r0`);
- apk writes a pre-release as an underscore suffix without a dot, `_alpha`, `_beta`, `_rc` with a number, and orders it below the release: `0.1.0_rc2 < 0.1.0`;
- apk has no build metadata (`+…`).

In scope: the version source, the binary version, the package version, the format check. Out of scope: git tags and release publishing, package signing, the `-rN` revision number when the same version is rebuilt.

## Decision drivers

1. **One version source** for the binary, the package and the frontend.
2. **Version order in apk matches semver**: a pre-release is below the release, `rc.10` is above `rc.2`, and `apk upgrade` from a candidate to the release works.
3. **A format error is caught when the package is built**, not on the router.
4. **No new dependencies or tools.**
5. **A development build requires no setup.**

## Considered options

1. **A `VERSION` file at the root with semver, the apk version derived in the `Makefile`.** `VERSION` contains a string like `0.1.0-rc.2`. `make` takes `-X metabox/internal/version.Version` for the binary from it and derives `PKG_VERSION`: `X.Y.Z` → `X.Y.Z-r0`, `X.Y.Z-(alpha|beta|rc).N` → `X.Y.Z_(alpha|beta|rc)N-r0`. The `package` target fails with a clear error if the version cannot be expressed as an apk version. Drawbacks: the frontend version in `apps/web/package.json` has to be kept equal by hand; the set of pre-releases is limited to what apk supports. **Chosen.**
2. **The version from git tags (`git describe`).** The source is the tag `v0.1.0-rc.2`. Advantages: the tag and the build do not diverge. Drawbacks: a build in the test bench container and in CI without tag history gets an empty version; between tags the result is a string `0.1.0-rc.2-5-gabc` that apk does not accept; there are no tags in the repository yet. **Rejected**; it can be added on top of option 1, checking the tag against `VERSION`.
3. **Write the version directly in apk format (`0.1.0_rc2`).** No conversion. Drawbacks: the string is not semver, yet the daemon shows it and a person reads it; `0.1.0_rc10` against `0.1.0_rc2` compares incorrectly in semver tools. **Rejected.**
4. **Write semver without a dot in the pre-release (`0.1.0-rc2`) and replace the hyphen with an underscore.** The shortest conversion. Drawback: by semver the identifier `rc2` is compared as a string, and `rc10` ends up below `rc2`. **Rejected.**
5. **Keep the current approach.** Set the version with a command line parameter when building the package. Drawbacks: the binary stays `dev`; the package version lives in the memory of whoever built it; a format error is discovered only on installation. **Rejected.**

## Decision outcome

- The release version is the `VERSION` file at the repository root, one semver line: `X.Y.Z` or `X.Y.Z-(alpha|beta|rc).N`. Currently `0.1.0-rc.2`.
- The `Makefile` reads `VERSION` into the `VERSION` variable and builds the binary with `-X metabox/internal/version.Version=$(VERSION)`. The `make VERSION=…` override remains.
- The `Makefile` derives `APK_VERSION` by apk rules and `PKG_VERSION ?= $(APK_VERSION)-r0`. The `package` target fails if `APK_VERSION` is empty.
- `apps/web/package.json` declares the same version.
- A version bump is an edit of `VERSION` and `package.json` in the same commit as the release.

## Consequences

### Positive

- The daemon answers with the real version in `GET /api/status`; the panel and the package name the same build.
- Version order in apk matches semver: `0.1.0_rc2 < 0.1.0_rc10 < 0.1.0`.
- A typo in the version is caught on `make package`, not on the router.

### Negative

- The package `0.1.0-r0` already installed on the router is, for apk, above any `0.1.0_rcN`. The first installation of a candidate is an explicit installation from a file, and until the `0.1.0` release `apk upgrade` will consider the installed package newer. A one-off consequence of the build made before this decision.
- The frontend version is duplicated in `apps/web/package.json` and checked by hand.
- Pre-releases other than `alpha`, `beta`, `rc` and build metadata are not available.

### Neutral or deferred

- Git tags and checking the tag against `VERSION` in CI are a separate decision, once release publishing appears.
- The `-rN` revision number when the same version is rebuilt is always `r0` for now.

## Compatibility, migration and rollback

The decision does not touch contracts or data. On the router the package `0.1.0-r0` is replaced by explicitly installing the file `0.1.0_rc2-r0`. Rollback: return `VERSION ?= dev` and `PKG_VERSION ?= 0.0.0-r0` to the `Makefile`, delete `VERSION`.

## Validation

- `make -n daemon` prints `-X metabox/internal/version.Version=0.1.0-rc.2`.
- `make -n package` prints `PKG_VERSION=0.1.0_rc2-r0`.
- `make -n package VERSION=dev` fails with a message about the version format.
- `make -n package VERSION=1.2.3-beta.10` prints `PKG_VERSION=1.2.3_beta10-r0`.

## Links

- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md): delivery as an apk package;
- `Makefile`, `VERSION`, `apps/web/package.json`, `CONTRIBUTING.md` (the variables table);
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html): pre-release order;
- [apk-tools, version format](https://wiki.alpinelinux.org/wiki/APKBUILD_Reference#pkgver): the `_alpha`, `_beta`, `_rc` suffixes.
