**English** · [Русский](./Development.ru.md)

# Development

How to build metabox from source, bring up the test bench and run the checks. The process (branches, commits, PRs) is in [`CONTRIBUTING.md`](../CONTRIBUTING.md); development rules are in [`AGENTS.md`](../AGENTS.md) and each project's `AGENTS.md`.

## Repository layout

A monorepo: each project keeps its code, manifest, rules (`AGENTS.md`) and guides in its own folder. The build is tied together by the [`Makefile`](../Makefile), the JS packages by a pnpm workspace.

| Project           | Folder             | What it is                                                                |
| ----------------- | ------------------ | ------------------------------------------------------------------------- |
| Daemon `metaboxd` | `apps/metaboxd/`   | Go, module `metabox`. Owns the config files and serves the embedded SPA   |
| Frontend          | `apps/web/`        | Vite and React, a pnpm workspace package. Built into the daemon binary    |
| Schema generator  | `tools/schemagen/` | Go, a separate module. Builds the config Zod schema from the fork sources |

The test bench and the OpenWrt image are in `.devcontainer/`, the router package in `apps/metaboxd/package/`, CI in `.github/workflows/`.

## Requirements

- Go: the version is in [`.go-version`](../.go-version).
- Node.js and pnpm: the `engines` and `packageManager` fields in [`package.json`](../package.json).
- Docker: for the test bench and the package build. apk-tools 3, which builds the package, exists only in the container.

The first command is `pnpm install`: it also installs the lefthook git hooks.

Go commands run from the module directory; there is no module at the root. Go build, generation and lint go through `make` from the root; daemon tests can also be run directly: `cd apps/metaboxd && go test ./...`.

## Commands

Build and generation:

| Command              | What it does                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `make daemon`        | builds the SPA and the daemon for the current machine into `dist/metaboxd`                                  |
| `make daemon-device` | builds the SPA and the daemon for the router (`linux/arm64`, no cgo) into `dist/metaboxd-linux-arm64`       |
| `make daemon-target` | builds the daemon inside the dev container; on macOS `make daemon` gives a darwin binary                    |
| `make package`       | builds the `dist/metaboxd.apk` package with the same Docker stage that installs the panel in the test bench |
| `make schema`        | regenerates the config schema from the fork into `apps/web/src/shared/api/generated.ts`                     |
| `make schema-daemon` | reprints the daemon contract for the panel into `apps/web/src/shared/api/daemon.generated.ts`               |
| `make clean`         | removes `dist/`, the frontend build and the static files copied into the daemon                             |

Frontend without the test bench:

| Command                 | What it does                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `make dev`              | Vite dev server                                                                               |
| `make dev-mock`         | dev server on MSW mocks: no daemon or sing-box needed, data comes from fixtures               |
| `make dev-mock-missing` | mocks answer only where the daemon has no endpoints yet; other requests go to the live daemon |

The test bench is OpenWrt in a container with procd, sing-box and the panel from the package, with wired, guest and external networks ([ADR-0023](./adr/ADR-0023-build-the-bench-from-the-device-firmware.md)):

| Command                     | What it does                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `make stand-base`           | builds the test bench base from the BPI-R4 firmware image from downloads.openwrt.org                                              |
| `make up`                   | brings up the test bench; panel at `https://localhost:8080` (the browser warns: the bench root is not trusted), Clash API on 9090 |
| `make up-dev`               | the same plus the Vite dev server with HMR on 5173                                                                                |
| `make down`                 | stops the test bench                                                                                                              |
| `make stand-reset`          | resets the test bench config to the reference from the image                                                                      |
| `make sh`, `make target-sh` | shell in the dev container and in the OpenWrt container                                                                           |
| `make apply-check`          | runs the Apply cycle in the test bench                                                                                            |
| `make reach-check`          | checks that the panel answers from the test bench local networks and not from the external one                                    |
| `make dataplane-check`      | checks traffic interception; needs a privileged container and a kernel with tproxy                                                |

Checks:

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `make test`         | daemon, generator and frontend tests             |
| `make lint`         | golangci-lint over both Go modules               |
| `pnpm lint`         | oxlint over the whole repository                 |
| `pnpm format`       | oxfmt over the whole repository                  |
| `pnpm format:check` | format check without changes                     |
| `make hooks`        | installs the git hooks if `pnpm install` did not |

`pnpm lint` runs only from the root: the Tailwind plugin looks for the frontend config relative to the directory it is run from. The full list of checks before committing and what CI runs: [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Package for the router

The package architecture comes from the OpenWrt base image and must match `/etc/apk/arch` on the router, otherwise apk will not install the package. For mediatek/filogic routers (`aarch64_cortex-a53`) the base is built from the firmware image; without `METABOX_BASE_IMAGE` the package is built for `aarch64_generic`.

```sh
pnpm install
make stand-base
make package METABOX_BASE_IMAGE=metabox/openwrt-device:latest
```

Copy `dist/metaboxd.apk` and a [sing-box-extended](https://github.com/shtorm-7/sing-box-extended/releases) package of the same architecture to the router. dropbear on OpenWrt has no sftp server, so `scp` needs `-O`:

```sh
scp -O dist/metaboxd.apk sing-box-extended_1.14.1-extended-2.7.2_openwrt_aarch64_cortex-a53.apk root@192.168.1.1:/tmp/
```

On the router, the same way for updates:

```sh
apk add --allow-untrusted /tmp/sing-box-extended_*.apk /tmp/metaboxd.apk
```

`--allow-untrusted` is needed because the package from `make package` is not signed.

## Release

A release is a `v*` tag on a commit in `main`. The [`release`](../.github/workflows/release.yml) workflow checks that the tag equals `v` plus [`VERSION`](../VERSION) and that `apps/web/package.json` declares the same version, builds the package for `aarch64_cortex-a53` signed with the `APK_SIGN_KEY` secret, checks the signature against `keys/metabox-release.pem` and publishes a GitHub Release with the package, its sha256 and the public key. A version with a pre-release suffix becomes a prerelease. The [`apk repository`](../.github/workflows/apk-repo.yml) workflow then rebuilds the package repository from every release and deploys it to GitHub Pages; it also runs by hand from the Actions tab, so a release whose deploy failed is republished without a new tag. Pages is enabled once by the owner with the "GitHub Actions" source, and the `github-pages` environment it creates gets a rule that allows `v*` tags, because the release job deploys from the tag:

```sh
gh api -X POST repos/mderkach/metabox/pages -f build_type=workflow
gh api -X POST repos/mderkach/metabox/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
```

Steps: a PR that changes `VERSION` and `apps/web/package.json`; after the merge, a tag on the merge commit:

```sh
git switch main && git pull --ff-only
git tag v$(cat VERSION)
git push origin v$(cat VERSION)
```

### Signing key

Generated once by the owner, on their own machine and outside the repository. The private key goes only to the repository secret; it is not committed and not put on the router.

```sh
mkdir -p ~/.config/metabox keys
(umask 077 && openssl ecparam -name prime256v1 -genkey -noout -out ~/.config/metabox/release.key)
openssl ec -in ~/.config/metabox/release.key -pubout -out keys/metabox-release.pem
gh secret set APK_SIGN_KEY < ~/.config/metabox/release.key
```

`keys/metabox-release.pem` reaches `main` through a PR before the first tag, otherwise the release fails. Losing the private key means a new pair and the public key replaced on every router; a leaked key is replaced the same way.

### Installing a release on the router

The public key is put on the router once:

```sh
wget -O /etc/apk/keys/metabox-release.pem https://raw.githubusercontent.com/mderkach/metabox/main/keys/metabox-release.pem
```

After that a release package installs and updates without `--allow-untrusted`, and a package changed on the way or signed with another key is rejected. `sing-box-extended` must already be installed: it is not signed with this key and is not in the repository.

The packages come from the repository on GitHub Pages. Its index is signed with the same key and has two channels: `testing` holds every release, `stable` only versions without a pre-release suffix, so `stable` stays empty until the first such version. A channel is one line in `/etc/apk/repositories.d/`:

```sh
echo https://mderkach.github.io/metabox/apk/testing/packages.adb > /etc/apk/repositories.d/metabox.list
apk update
apk add metaboxd
```

A newer release is then `apk upgrade metaboxd`. A single downloaded package still installs by path: `apk add /tmp/metaboxd-<version>.apk`.

## Build variables

The release version is the [`VERSION`](../VERSION) file in semver. From it `make` derives the binary version and the apk package version: `0.1.0-rc.2` becomes `0.1.0_rc2-r0` ([ADR-0050](./adr/ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)).

Test bench and package settings (base image, architecture, sing-box-extended version) are set in `.devcontainer/.env`; the file is not committed. The variable table is in the "Project specifics" section of [`CONTRIBUTING.md`](../CONTRIBUTING.md). Without `.env`, the test bench and the package are built on the public image `openwrt/rootfs:aarch64_generic-25.12.4`.
