**English** · [Русский](./Development.ru.md)

# Development

How to build metabox from source, run the test bench and run the checks. How to send a change: [`CONTRIBUTING.md`](../CONTRIBUTING.md). Releases and other maintainer tasks: [`Maintaining.md`](./Maintaining.md).

## Quick start

```sh
pnpm install
make dev-mock
```

`pnpm install` installs the dependencies and the git hooks. `make dev-mock` starts the Vite dev server on mock data: the panel works without a router, a daemon or sing-box. Open the address Vite prints.

## Repository layout

A monorepo. Each project keeps its code, manifest, rules (`AGENTS.md`) and guides in its own folder. The [`Makefile`](../Makefile) ties the build together; the JS packages are a pnpm workspace.

| Project           | Folder             | What it is                                                                      |
| ----------------- | ------------------ | ------------------------------------------------------------------------------- |
| Daemon `metaboxd` | `apps/metaboxd/`   | Go, module `metabox`. Owns the config files and serves the embedded panel       |
| Frontend          | `apps/web/`        | Vite and React, a pnpm workspace package. Built into the daemon binary          |
| Schema generator  | `tools/schemagen/` | Go, a separate module. Builds the config schema from the sing-box-extended code |

Other folders: the test bench is in `.devcontainer/`, the router package files in `apps/metaboxd/package/`, CI in `.github/workflows/`.

## Prerequisites

- Go: the version is in [`.go-version`](../.go-version).
- Node.js and pnpm: the `engines` and `packageManager` fields in [`package.json`](../package.json).
- Docker: for the test bench and the package build. The package is built with apk-tools 3, which runs only in the container.

Git hooks: `pnpm install` installs them through the `prepare` script in `package.json`; `make hooks` reinstalls them.

There is no Go module at the repository root. Run Go build, generation and lint through `make` from the root. Daemon tests can also run directly: `cd apps/metaboxd && go test ./...`.

## Commands

Build and generation:

| Command              | What it does                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make daemon`        | builds the panel and the daemon for the current machine into `dist/metaboxd`                                                                                |
| `make daemon-device` | builds the panel and the daemon for the router (`linux/arm64`, no cgo) into `dist/metaboxd-linux-arm64`                                                     |
| `make daemon-target` | builds the daemon inside the dev container; on macOS `make daemon` gives a darwin binary                                                                    |
| `make package`       | builds the `dist/metaboxd.apk` package                                                                                                                      |
| `make schema`        | regenerates the config schema into `apps/web/src/shared/api/generated.ts` and the MCP field reference into `apps/metaboxd/internal/mcp/fields.generated.go` |
| `make schema-daemon` | reprints the daemon contract for the panel into `apps/web/src/shared/api/daemon.generated.ts`                                                               |
| `make clean`         | removes `dist/`, the frontend build and the static files copied into the daemon                                                                             |

Frontend without the test bench:

| Command                 | What it does                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `make dev`              | Vite dev server                                                                             |
| `make dev-mock`         | dev server on mock data: no daemon or sing-box needed                                       |
| `make dev-mock-missing` | mocks answer only where the daemon has no endpoints yet; other requests go to a live daemon |

Checks:

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `make test`         | daemon, generator and frontend tests |
| `make lint`         | golangci-lint over both Go modules   |
| `pnpm lint`         | oxlint over the whole repository     |
| `pnpm format`       | oxfmt over the whole repository      |
| `pnpm format:check` | format check without changes         |
| `make hooks`        | reinstalls the git hooks             |

`pnpm lint` runs only from the root: the Tailwind plugin looks for the frontend config relative to the current directory. The full list of checks before committing: [`CONTRIBUTING.md`](../CONTRIBUTING.md#checks-before-committing).

The config schema is generated from the sing-box-extended version pinned in the `replace` block of `tools/schemagen/go.mod`. How the pin is updated: [`Maintaining.md`](./Maintaining.md#sing-box-extended-updates).

## Test bench

The test bench is OpenWrt in a container. It runs procd, sing-box and the panel installed from the package, with wired, guest and external networks ([ADR-0023](./adr/ADR-0023-build-the-bench-from-the-device-firmware.md)).

On the bench the panel listens on port 8080; on a router it is 8088. The bench sets its own port in `.devcontainer/target/files/etc/config/metabox`.

| Command                     | What it does                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `make stand-base`           | builds the bench base from the BPI-R4 firmware image from downloads.openwrt.org           |
| `make up`                   | starts the bench; panel at `http://localhost:8080`, Clash API on 9090                     |
| `make up-dev`               | the same plus the Vite dev server with HMR on 5173                                        |
| `make down`                 | stops the bench                                                                           |
| `make stand-reset`          | resets the bench sing-box config to the reference from the image                          |
| `make sh`, `make target-sh` | shell in the dev container and in the OpenWrt container                                   |
| `make apply-check`          | runs the Apply cycle on the bench                                                         |
| `make reach-check`          | checks that the panel answers from the bench local networks and not from the external one |
| `make dataplane-check`      | checks LAN traffic interception; needs a privileged container and a kernel with tproxy    |

Bench variables are set in `.devcontainer/.env`. The file is not committed. Both docker compose and `make` read it, so `make package` builds for the same architecture the bench runs on. Without `.env`, the bench uses the public OpenWrt image, the same as CI.

| Variable             | Default                                       | Purpose                                                                           |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `METABOX_BASE_IMAGE` | `openwrt/rootfs:aarch64_generic-25.12.4`      | bench base; after `make stand-base`, `metabox/openwrt-device:latest`              |
| `DEVICE_IMAGE_URL`   | BPI-R4 release image from filogic             | the device image `make stand-base` takes the root file system from                |
| `DAEMON_BINARY`      | `dist/metaboxd-linux-arm64`                   | the binary the package is built from                                              |
| `OPENWRT_PLATFORM`   | `linux/aarch64_generic`                       | image platform: the public rootfs has a non-standard one, so it is set explicitly |
| `PKG_VERSION`        | from `VERSION`: `0.1.0-rc.2` → `0.1.0_rc2-r0` | package version: apk writes a semver pre-release as an `_rcN` suffix              |
| `PKG_ARCH`           | empty: the architecture of the base image     | package architecture; the release sets the router's `aarch64_cortex-a53`          |
| `APK_SIGN_KEY`       | empty: the package is unsigned                | path to the private key that signs the package                                    |

`PKG_ARCH` and `APK_SIGN_KEY` are read only by `make`. The release sets them; the bench builds without them.

The sing-box-extended release installed on the bench is not a variable: the version and the sha256 of each architecture are pinned in [`sing-box-extended.sha256`](../sing-box-extended.sha256), a `sha256sum` file. The bench Dockerfile downloads the package for the base architecture and checks it with `sha256sum -c`; `metaboxd` depends on `sing-box-extended` of that version or newer. [`install.sh`](../install.sh) carries the same version and the router hash as literals, and `make singbox-pin-check` (also run by CI) fails if they differ from the file.

### Checking `install.sh`

Run the script in a container from the device image, never on the router. The container has no procd, so create the lock directories first. The script installs the fork and `metaboxd` from the published feed:

```sh
make stand-base
docker run -d --name install-check --platform linux/aarch64_generic -v "$PWD/install.sh:/install.sh:ro" metabox/openwrt-device:latest sleep 3600
docker exec install-check sh -c 'mkdir -p /var/lock /var/run && sh /install.sh --lang en'
```

Run it a second time with `docker exec install-check /etc/init.d/sing-box enable` before it: the script must report the enabled fork service and, without a terminal, print the stop commands instead of the plain start hint. With a terminal (`docker exec -it`) it asks before disabling the service. Remove the container with `docker rm -f install-check`.

### HTTP Apply test on the CI bench

The CI integration job also runs `go test -tags integration -run TestApplyHTTPOnEphemeralBench -count=1 -v -timeout 5m .` from `apps/metaboxd` against its disposable target. The test checks HTTP Apply, confirmation, rejection without a write, timeout rollback, daemon restart and an interrupted write.

It needs `CI=true` and `METABOX_EPHEMERAL_BENCH=1`: it changes the config and restarts the daemon, so do not enable it on your own bench. `make apply-check` stays the independent environment check. Container tests do not prove recovery from a power loss or directory `fsync` on a router's overlayfs ([ADR-0067](./adr/ADR-0067-test-http-apply-on-the-disposable-ci-bench.md)).

## Package for the router

`make package` builds the package with the same Docker stage that installs the panel on the bench, so the two cannot differ.

The package architecture comes from the bench base image. It must match `/etc/apk/arch` on the router, otherwise apk refuses the package. For mediatek/filogic routers (`aarch64_cortex-a53`), build the base from the firmware image first. Without `METABOX_BASE_IMAGE` the package is built for `aarch64_generic`.

```sh
pnpm install
make stand-base
make package METABOX_BASE_IMAGE=metabox/openwrt-device:latest
```

The package version comes from the [`VERSION`](../VERSION) file in semver: `0.1.0-rc.2` becomes `0.1.0_rc2-r0` ([ADR-0050](./adr/ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)).

Copy `dist/metaboxd.apk` and a [sing-box-extended](https://github.com/shtorm-7/sing-box-extended/releases) package of the same architecture to the router. dropbear on OpenWrt has no sftp server, so `scp` needs `-O`:

```sh
scp -O dist/metaboxd.apk sing-box-extended_1.14.1-extended-2.7.2_openwrt_aarch64_cortex-a53.apk root@192.168.1.1:/tmp/
```

On the router (the same for updates):

```sh
apk add --allow-untrusted /tmp/sing-box-extended_*.apk /tmp/metaboxd.apk
```

`--allow-untrusted` is needed because a package from `make package` is not signed. A package installed from a file is pinned to it; how to switch back to the repository is in the README, "Update and removal".
