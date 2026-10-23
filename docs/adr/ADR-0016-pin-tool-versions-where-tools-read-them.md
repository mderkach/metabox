# ADR-0016. Keep a tool's version where the tool itself reads it, and pin Go with an explicit GOTOOLCHAIN

- Status: Accepted
- Date: 2026-09-14
- Deciders: repository owner

## Context and problem statement

On 14 September 2026, `brew upgrade` bumped the system Go to 1.27.1, and `make test-schemagen` stopped linking:

```
Undefined symbols for architecture arm64:
  "_golang.org/x/net/http2.(*Transport).connPool", referenced from: _runtime.text
```

The cause is in the fork: `shtorm-7/sing-box-extended` pulls an unexported method of another package with the directive `//go:linkname transportConnPool golang.org/x/net/http2.(*Transport).connPool` (`transport/v2rayxhttp/dialer.go`, `transport/v2rayhttp/force_close_legacy.go`). The `-checklinkname=0` flag, which `make schema` and `make test-schemagen` take from the fork's `release/LDFLAGS`, only disables the check of such a directive; it does not make the linker keep the target symbol. The Go 1.27 linker drops it.

CI did not catch this: the Go version there was pinned by the `setup-go` step. Only the host broke, where nothing set the Go version.

State at the time of the decision:

| Tool | Where the version lived                                                                                                            | What determined the version on the host |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Go   | `go 1.26.4` in two `go.mod` files; the literal `1.26.7` in two CI steps, in `ARG GO_VERSION` of the dev image and twice in compose | whatever is installed on the system     |
| Node | `.nvmrc`, read by CI and the dev image                                                                                             | `nvm use`, if someone remembers it      |
| pnpm | `packageManager` in the root `package.json`                                                                                        | corepack                                |

The same literal `1.26.7` was written in five places, and the Go version on the developer machine was tied to none of them.

In scope: the Go, Node and pnpm versions used to build and check the repository. Out of scope: dependency versions (held by `saveExact: true` and the lock file), the sing-box version in the test bench target image, the golangci-lint version (pinned in the `Makefile` by the line `go run …@v2.13.2`).

## Decision drivers

- How many places contain the version and can diverge from each other.
- Whether the version on the host, in the dev image and in CI matches without manual discipline.
- Whether the consumer reads the version directly or repeats it as a literal.
- Cost: new tools and new machinery that will need maintenance.

## Considered options

1. **A `toolchain` directive in both `go.mod` files**: the mechanism built into the language itself. **Rejected: it does not solve the original problem.** With `GOTOOLCHAIN=auto`, go switches only upwards: a `toolchain` line older than the local toolchain is silently ignored. From go's own tests (`src/cmd/go/testdata/script/gotoolchain_local.txt`):

   ```
   go mod edit -go=1.700 -toolchain=go1.300
   go version
   stdout go1.700 # toolchain too old, ignored
   ```

   With the system 1.27.1, the line `toolchain go1.26.8` would change nothing. Besides, on a patch version it fully duplicates the `go` directive: both pin only upwards, but put two different numbers into one file.

2. **The version in the file the consumer reads itself**: `.go-version` for Go, `engines` and `packageManager` in `package.json` for Node and pnpm; the `Makefile` exports `GOTOOLCHAIN` from `.go-version`. **Chosen.** An explicit `GOTOOLCHAIN` without the `+auto` suffix forces exactly the named toolchain and downloads it if the system has a different one; this is the only way to pin the Go version downwards.

3. **Keep the version in several places and check them with a script on commit**: cheaper than rewriting the consumers. **Rejected:** the check does not set the version, it reports a mismatch that it itself allows. It is cheaper to leave nothing to duplicate: `docker-compose.yml` stopped passing the Go version as an argument, and the dev image takes Node from `package.json` instead of a second file.

4. **The `mise` or `asdf` version manager with `.tool-versions`**: one file for all tools, the version switches on entering the directory, so it also applies to commands that bypass `make`. **Rejected:** it requires installing and configuring a new tool for everyone who touches the repository, while Node already lives on `fnm`/`nvm` and pnpm on corepack. It is worth coming back to if the number of tools grows noticeably.

5. **Keep the current approach and agree verbally**: **rejected:** it has already failed.

## Decision outcome

A tool's version is written in the file that this tool or its installer reads itself. No places remain where the version has to be repeated by hand.

| Tool | Where the version is written                | Who reads it                                                                      |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Go   | `.go-version`                               | the `Makefile` through `GOTOOLCHAIN`; CI through `go-version-file`                |
| Node | `engines.node` in the root `package.json`   | CI through `node-version-file: package.json`; the dev image through `jq` in `RUN` |
| pnpm | `packageManager` in the root `package.json` | corepack in the dev image; `pnpm/action-setup` in CI; pnpm itself on the host     |

The `Makefile` starts with the line `export GOTOOLCHAIN := go$(shell cat .go-version)`. All targets get the version from here (`test`, `lint`, `daemon`, `schema`), both on the host and inside the dev container where the repository is mounted.

The `go` directive in both `go.mod` files matches `.go-version` in number: it declares the module's minimum version and pins only upwards. We do not add a `toolchain` directive: on a patch version it adds nothing to `go`.

The dev image is built from the `golang:<major.minor>-trixie` branch that matches `.go-version`, not an exact version: the exact one is set by `GOTOOLCHAIN` from `.go-version` when the command goes through `make`. A Go minor bump edits this `FROM` line together with `.go-version`.

`engines.node` and `engines.pnpm` declare the version, they do not check it. They are not an enforcement measure: on pnpm 11.25.0 a mismatch gave `[WARN] Unsupported engine`, and `engineStrict: true` failed the install; on pnpm 12.4.1 neither happens: an install on Node 24.16.0 with `engines.node: 24.21.0` passes silently (measured 2026-09-14). So we do not keep `engineStrict` in `pnpm-workspace.yaml`.

`.nvmrc` stays, but it is no longer the source of the version: `nvm` and `fnm` do not read `package.json`, and without this file Node cannot be switched locally with one command. Its value is kept equal to `engines.node`.

Versions at the time of the decision: Go `1.26.8` (the latest patch of the 1.26 branch; 1.27 is blocked by the fork), Node `24.21.0`, pnpm `12.4.1`.

### Scope and boundaries

The decision covers the repository root, `.devcontainer/`, `.github/workflows/ci.yml` and the `go.mod` of both Go modules. It does not cover the sing-box version in the test bench target image or dependency versions.

## Consequences

### Positive

- The Go version on the host no longer depends on what is installed on the system: `make test-schemagen` passes with the system Go 1.27.1 too, because go downloads 1.26.8 itself.
- Each tool's version is written in one place; there is nowhere left to repeat it by hand, so nothing can diverge.
- Bumping a version is an edit of one file: `.go-version` for Go, `package.json` for Node and pnpm.

### Negative

- `GOTOOLCHAIN` from the `Makefile` applies only to commands through `make`. `go test ./...` by hand and the "Run test" button in an IDE use the system Go. This can be closed completely only by the user setting `go env -w GOTOOLCHAIN=go<version from .go-version>`, which applies to the whole user, not to the repository.
- The first run on a machine with a different Go spends time and space downloading the toolchain into `GOMODCACHE` (about 100 MB).
- `.nvmrc` repeats `engines.node`, and nothing prevents them from diverging. The cost of a mismatch is low: `nvm use` gives the wrong Node version, and CI and the dev image do not notice because they read `package.json`.
- The dev image is no longer tied to an exact Go version: `go build` inside the container bypassing `make` takes whatever ended up in that minor branch.

### Neutral or deferred

- The decision does not remove the fork's fragility: `//go:linkname` to an unexported method of `x/net/http2` breaks on any Go whose linker stops keeping this symbol. The pin fixes a known working version. It kept Go on the 1.26 branch until the fork `v1.14.1-extended-2.7.2` gained a `go1.27` variant in `common/force_close`; since 2026-10-24 `.go-version` follows the 1.27 branch, and every Go or fork bump checks that `common/force_close` has a variant for the new Go minor.
- There is no check of the Node version on a developer machine. `engines` in pnpm 12 does not provide it; if it is needed, that is a separate decision.

## Risks and mitigations

| Risk                                                                  | Likelihood and impact                      | Mitigation                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| A developer builds bypassing `make` and gets the system Go            | medium; a build error, not data corruption | the `go` directive names the expected version; the error is reproducible   |
| `.nvmrc` diverges from `engines.node`                                 | medium; the wrong Node version locally     | both values sit next to each other in the root and are changed in one edit |
| The `golang:<minor>` branch moves to a patch older than `.go-version` | low; inside the container bypassing `make` | `make` targets take the exact version anyway                               |
| A new Go minor drops a symbol the fork links to                       | low; the schema build stops                | `.go-version` stays until `common/force_close` has a variant for that Go   |

## Compatibility, migration and rollback

The migration is one-off and already done: `.go-version` is added, the `go` directive in both modules is set to the same version, the CI steps are switched to `go-version-file` and `node-version-file: package.json`, `args: GO_VERSION` is removed from both services in `docker-compose.yml`, and the dev image is switched to the `golang:1.26` branch and reads Node from `package.json`. Existing configs, data and contracts are not affected.

The same change bumped versions: Node 24.20.0 → 24.21.0, pnpm 11.25.0 → 12.4.1. pnpm 12 is rewritten in Rust and compatible with 11 in commands, settings and lock format; `pnpm install` accepted the existing lock without re-resolution and added a `packageManagerDependencies` section with pnpm's own binaries to it.

Rollback is to remove `export GOTOOLCHAIN` from the `Makefile`; the version on the host becomes whatever is installed on the system again. The rest (`.go-version`, `engines`, reading versions from `package.json`) is harmless and can stay.

The dev image has to be rebuilt after the change: `make up` brings up the test bench with `--build`.

## Validation

- `make test-schemagen` with the system Go 1.27.1 passes; without `GOTOOLCHAIN` on the same machine it failed with the linking error from the "Context" section.
- `cd apps/metaboxd && go env GOTOOLCHAIN` under `make` prints `go1.26.8`, outside `make` it prints `auto`.
- `pnpm install --frozen-lockfile` on pnpm 12.4.1 passes: the lock is compatible, no re-resolution is needed.
- Editing `.go-version` changes the version in all `make` targets and in both CI steps without editing other files.

## Links

- [`Makefile`](../../Makefile), [`package.json`](../../package.json), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.devcontainer/Dockerfile.dev`](../../.devcontainer/Dockerfile.dev);
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md): why the schema generator is built with the fork's tags and flags, which is why it runs into the Go version;
- [`AGENTS.md`](../../AGENTS.md), the "General" section: the rule on where versions live;
- Go, toolchain management: <https://go.dev/doc/toolchain>;
- `actions/setup-go`, the `go-version-file` input: <https://github.com/actions/setup-go#usage>;
- `actions/setup-node`, the `node-version-file` input and the order of reading `package.json`: <https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md>;
- pnpm 12, compatibility with 11: <https://pnpm.io/blog/releases/12.0>.
