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

| Command                     | What it does                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `make stand-base`           | builds the test bench base from the BPI-R4 firmware image from downloads.openwrt.org           |
| `make up`                   | brings up the test bench; panel at `http://localhost:8080`, Clash API on 9090                  |
| `make up-dev`               | the same plus the Vite dev server with HMR on 5173                                             |
| `make down`                 | stops the test bench                                                                           |
| `make stand-reset`          | resets the test bench config to the reference from the image                                   |
| `make sh`, `make target-sh` | shell in the dev container and in the OpenWrt container                                        |
| `make apply-check`          | runs the Apply cycle in the test bench                                                         |
| `make reach-check`          | checks that the panel answers from the test bench local networks and not from the external one |
| `make dataplane-check`      | checks traffic interception; needs a privileged container and a kernel with tproxy             |

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

## Build variables

The release version is the [`VERSION`](../VERSION) file in semver. From it `make` derives the binary version and the apk package version: `0.1.0-rc.2` becomes `0.1.0_rc2-r0` ([ADR-0050](./adr/ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)).

Test bench and package settings (base image, architecture, sing-box-extended version) are set in `.devcontainer/.env`; the file is not committed. The variable table is in the "Project specifics" section of [`CONTRIBUTING.md`](../CONTRIBUTING.md). Without `.env`, the test bench and the package are built on the public image `openwrt/rootfs:aarch64_generic-25.12.4`.
