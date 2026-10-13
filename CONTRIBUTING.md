**English** · [Русский](./CONTRIBUTING.ru.md)

# Contributing

Development rules: [`AGENTS.md`](./AGENTS.md); requirements: [`docs/PRD.md`](./docs/PRD.md); Go guides: [`apps/metaboxd/docs/guides/`](./apps/metaboxd/docs/guides/README.md); frontend guides: [`apps/web/docs/`](./apps/web/docs/README.md). This file covers only the process: branch, commit, checks, PR.

## Workflow

1. Branch from `main`: `<type>/<short-hyphenated-summary>`, for example `feat/apply-rollback`.
2. Changes follow the rules of the affected part of the repository.
3. Local checks: see the table below. Do not commit anything red.
4. Atomic commits in the Conventional Commits format.
5. PR to `main`, CI green.

## Commit format

Specification: [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Checked by commitlint; the rules are in `commitlint.config.mjs`.

```text
<type>(<scope>): <what was done>

<body: why, and what is important to know>

<footers>
```

The whole commit message is in English. The header is in the imperative mood ("add", not "added" or "adds"), without a trailing period, up to 72 characters. The body and footers are separated by a blank line. The body explains the reason and consequences, not the diff: what changed is visible from the diff itself.

### Types

| Type       | When                                       |
| ---------- | ------------------------------------------ |
| `feat`     | new behaviour visible to the user          |
| `fix`      | a defect fix                               |
| `refactor` | same behaviour, the code structure changes |
| `perf`     | optimisation without a behaviour change    |
| `test`     | tests and fixtures only                    |
| `docs`     | documentation only                         |
| `build`    | build, dependencies, toolchain             |
| `ci`       | pipelines and their configs                |
| `chore`    | everything else not covered above          |
| `revert`   | reverting an earlier commit                |

### Scopes

| Scope    | What it covers                                            |
| -------- | --------------------------------------------------------- |
| `daemon` | `apps/metaboxd/`                                          |
| `schema` | `tools/schemagen`, `apps/web/src/shared/api/generated.ts` |
| `fe`     | `apps/web/` except the generated schema                   |
| `docs`   | `docs/` and root documents, when the type is not `docs`   |
| `ci`     | `.github/`                                                |
| `infra`  | `.devcontainer/`, `Makefile`                              |
| `deps`   | dependency and toolchain version updates                  |
| `ai`     | `.claude/`, agent instructions and skills                 |

The same list is in `scope-enum` of `commitlint.config.mjs`. The scope is omitted when the change really touches the whole repository, and for a `docs` commit that edits only `docs/` and root documents (`README.md`, `AGENTS.md`, `CONTRIBUTING.md`): `docs(docs)` would repeat the type. A project's documentation (its guides, `AGENTS.md`, `README.md` and code comments) goes with the project scope: `docs(daemon)`, `docs(fe)`.

### Breaking changes

`!` after the scope and a `BREAKING CHANGE:` footer describing the migration. Mandatory for the daemon API and the config format.

```text
refactor(schema)!: rename generated Outbound fields

BREAKING CHANGE: field `outbound.tag` is renamed to `outbound.name`;
old configs are read but rewritten on save.
```

### Examples

```text
feat(daemon): add config rollback on failed healthcheck
fix(fe): keep draft when websocket reconnects
build(deps): bump oxlint to 1.80.0
```

Bad: `update code`, `fix bug`, `wip`, `review fixes`, `chore: misc`.

## Atomicity

One commit, one topic. A sign of violation: the body has to list unrelated items. Moving files, renaming and a content change are separate commits, otherwise the diff is unreadable.

Only what belongs to the commit's topic goes into the index. A blind `git add -A` and picking up someone else's uncommitted changes produce junk commits: check `git status`.

## What we do not commit

- `apps/web/src/shared/api/generated.ts` edited by hand: the generator is edited, and the file is rebuilt with `make schema`.
- `apps/web/src/shared/api/daemon.generated.ts` edited by hand: the daemon is edited, and the file is rebuilt with `make schema-daemon`.
- `*.local.*` (`AGENTS.local.md`, `.claude/settings.local.json`): they are in `.gitignore`.
- `.omc/**`: agents' working notes; do not link to them from commits, code or documentation.
- Secrets, keys, config dumps from real devices.
- `dist/`, `apps/web/dist/`, `node_modules/`.

## Checks before committing

| What                     | Command                             |
| ------------------------ | ----------------------------------- |
| Go: daemon tests         | `cd apps/metaboxd && go test ./...` |
| Go: generator tests      | `make test-schemagen`               |
| Go: lint                 | `make lint`                         |
| Lint (whole repo)        | `pnpm lint`                         |
| Format (whole repo)      | `pnpm format:check`                 |
| Frontend types and build | `pnpm --filter web build`           |
| Everything               | `make test`                         |

Commands run from the root, except the daemon tests: there is no module at the root, so `go test ./...` works only from the module directory. The frontend is a workspace package, hence `pnpm --filter web <script>`. The linter config cascades (`apps/web/.oxlintrc.json` extends the root one) and runs only from the root: the Tailwind plugin resolves the frontend config through the `cwd` setting, which is relative to the directory it is run from.

Check results are quoted as is; do not commit anything red.

## Hooks

Checks are run by lefthook, installed once: `make hooks` (in the devcontainer, `postCreateCommand` does it). The config is `lefthook.yml` at the root.

| Hook         | What it does                                                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | gofmt, lint and format of **changed files only**; `go vet ./...` over both Go modules in full if the commit has Go files; the generated `generated.ts` and `daemon.generated.ts` require a change to their generator in the same commit |
| `commit-msg` | commitlint by the rules of this document                                                                                                                                                                                                |
| `pre-push`   | the whole repository: `pnpm lint`, `make lint`, `pnpm format:check`, `make test`, frontend build with type checking                                                                                                                     |

The split is by cost: a commit checks what went into it and takes under a second; a push runs everything. The reason is that type-aware rules see the whole project: a change in one file breaks types in another, and checking only the changed files does not catch it.

Jobs are selected by staged files: a Go-only change does not run the frontend checks, and the other way round. The generated schema is excluded from the lint and format file lists: it is covered by `ignorePatterns`, and oxlint and oxfmt exit with an error when no file is left after ignoring.

`git commit --no-verify` only when the change objectively cannot pass a check, and this is explained in the PR.

## Documentation in the commit

The PRD is the primary source of requirements and decisions. Documents are edited in the same commit as the change, not later:

| What changes in the commit                           | What is edited                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| an acceptance criterion is met                       | the AC checkbox in section 5 is ticked                                 |
| a new technical decision is made                     | an ADR in `docs/adr/`; the PRD is edited only if a requirement changes |
| a file or directory mentioned in documents has moved | the paths in the documents                                             |

An AC checkbox is ticked only when the criterion is confirmed by a run: a test, CI or a measurement. "Written, probably works" is not a reason.

New technical decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/README.md). PRD appendix A is closed to new entries: its sections moved to ADRs, and the appendix keeps links to them.

## PR

- Describes what and why; links to the PRD or an ADR if the decision goes there.
- CI is mandatory and runs the same as `pre-push`, plus commitlint over all PR commits, `make daemon`, an integration run on the target environment image, and react-doctor advice (`pnpm --filter web lint:react`) as a step that does not fail the build.
- Changes reach `main` only through a PR. A repository rule blocks the merge until the `checks` and `integration` jobs pass. Updating the branch to the latest `main` before the merge is not required. The job names are written into the rule: renaming them in `ci.yml` goes together with editing the rule, otherwise the merge waits for a check that no longer exists.

## Project specifics

**Daemon (`apps/metaboxd/`).** Owns the config files and the Apply cycle. Changes to the API or the storage format are breaking and require a footer and a PRD edit. Before editing code, read the document from the table in [`apps/metaboxd/AGENTS.md`](./apps/metaboxd/AGENTS.md); before handing in, the [review checklist](./apps/metaboxd/docs/guides/ReviewChecklist.md).

**Schema (`tools/schemagen`).** The generator is the source, `apps/web/src/shared/api/generated.ts` is the artifact. A commit must contain both the generator change and the regenerated file, otherwise the frontend diverges from the schema.

**Daemon contract.** The same order applies to `apps/web/src/shared/api/daemon.generated.ts`: it is printed by `apps/metaboxd/cmd/contractgen`, its source is the daemon structures, and the artifact goes in the same commit as their change.

**Frontend (`apps/web/`).** Before editing code, read the document from the table in [`apps/web/AGENTS.md`](./apps/web/AGENTS.md); before handing in, the [review checklist](./apps/web/docs/guides/ReviewChecklist.md). Part of the rules is checked by `pnpm lint`; there is no need to repeat them in the PR description.

**Test bench (`.devcontainer/`).** Emulates the router: the panel and sing-box are installed as apk packages, netifd brings up the wired, guest and external networks, and the panel takes addresses from the networks the same way as on the device ([ADR-0023](./docs/adr/ADR-0023-build-the-bench-from-the-device-firmware.md)).

| Command            | What it does                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `make stand-base`  | builds the test bench base from the device image from downloads.openwrt.org                               |
| `make up`          | brings up the test bench the way the router works: the daemon serves the panel from embedded static files |
| `make up-dev`      | the same plus a dev server with HMR on 5173                                                               |
| `make apply-check` | runs the whole Apply cycle                                                                                |
| `make reach-check` | checks that the panel answers from the local networks and does not answer from the external one           |
| `make package`     | builds the panel package for the device with the same stage that installs it in the test bench            |

Test bench variables are set in `.devcontainer/.env`, which docker compose reads; the file is not committed.

| Variable             | Default                                       | Purpose                                                                           |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `METABOX_BASE_IMAGE` | `openwrt/rootfs:aarch64_generic-25.12.4`      | test bench base; after `make stand-base`, `metabox/openwrt-device:latest`         |
| `DEVICE_IMAGE_URL`   | BPI-R4 release image from filogic             | the device image from which `make stand-base` takes the root                      |
| `DAEMON_BINARY`      | `dist/metaboxd-linux-arm64`                   | the binary the panel package is built from                                        |
| `OPENWRT_PLATFORM`   | `linux/aarch64_generic`                       | image platform: the public rootfs has a non-standard one, so it is set explicitly |
| `PKG_VERSION`        | from `VERSION`: `0.1.0-rc.2` → `0.1.0_rc2-r0` | panel package version: apk writes a semver pre-release as an `_rcN` suffix        |
| `SINGBOX_VERSION`    | `1.14.1-extended-2.7.2`                       | the fork release the sing-box package is taken from                               |
| `PKG_ARCH`           | empty: the arch of the base image             | package arch; the release sets the router's `aarch64_cortex-a53`                  |
| `APK_SIGN_KEY`       | empty: the package is unsigned                | path to the private key the package is signed with                                |

The file is read by both docker compose and `make`, so `make package` builds the package for the same architecture the test bench runs on. `PKG_ARCH` and `APK_SIGN_KEY` are read only by `make`: the release sets them, the test bench builds without them.

Without `.env`, the test bench is built on the public OpenWrt image, the same path CI takes.

## Commits by AI agents

The message format is the same as for people. In addition:

- Commit and push only on explicit request. Without it, changes stay in the working tree, and the response lists what was changed.
- A branch is mandatory: if the current one is `main`, create a branch first.
- Before committing, run the checks of the affected part and quote the result as is.
- One commit, one topic. If the diff is mixed, propose a split and wait for a decision.
- Do not rewrite history: `amend`, `rebase`, force-push only on direct request.
- The message is a single header, without a body or trailers: the whole repository history looks like this.
