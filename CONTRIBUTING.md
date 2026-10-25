**English** · [Русский](./CONTRIBUTING.ru.md)

# Contributing

This file is the process: how to send a change, commit format, checks, PR. Build and the test bench: [`docs/Development.md`](./docs/Development.md). Development rules: [`AGENTS.md`](./AGENTS.md) and the `AGENTS.md` of each project. Requirements: [`docs/PRD.md`](./docs/PRD.md).

## Your first pull request

1. Fork the repository and create a branch from `main`: `<type>/<short-hyphenated-summary>`, for example `fix/rule-reorder`.
2. Install dependencies: `pnpm install`. It also installs the git hooks.
3. See the panel without a router: `make dev-mock`. The dev server runs on mock data; no daemon or sing-box is needed.
4. Make the change and run the [checks](#checks-before-committing).
5. Open a PR to `main`.

The first PR from a fork waits until the maintainer approves its CI run. This is a GitHub rule for new contributors.

## Commit format

Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). commitlint checks them; the rules are in `commitlint.config.mjs`.

A commit message is one header line, with no body and no trailers. The whole history looks like this.

```text
<type>(<scope>): <what was done>
```

- In English.
- Imperative mood: "add", not "added" or "adds".
- No trailing period.
- Up to 72 characters.

A breaking change has `!` after the scope: `refactor(schema)!: rename generated Outbound fields`. It is required for changes to the daemon API and the config format.

Examples:

```text
feat(daemon): add config rollback on failed healthcheck
fix(fe): keep draft when websocket reconnects
build(deps): bump oxlint to 1.80.0
```

Bad: `update code`, `fix bug`, `wip`, `review fixes`, `chore: misc`.

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

| Scope    | What it covers                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| `daemon` | `apps/metaboxd/`                                                                                            |
| `schema` | `tools/schemagen`, `apps/web/src/shared/api/generated.ts`, `apps/metaboxd/internal/mcp/fields.generated.go` |
| `fe`     | `apps/web/` except the generated schema                                                                     |
| `docs`   | `docs/` and root documents, when the type is not `docs`                                                     |
| `ci`     | `.github/`                                                                                                  |
| `infra`  | `.devcontainer/`, `Makefile`                                                                                |
| `deps`   | dependency and toolchain version updates                                                                    |
| `ai`     | `.claude/`, agent instructions and skills                                                                   |

The same list is in `scope-enum` of `commitlint.config.mjs`.

Omit the scope when the change touches the whole repository. Omit it also for a `docs` commit that edits only `docs/` and root documents: `docs(docs)` would repeat the type. A project's own documentation (its guides, `AGENTS.md`, `README.md`, code comments) takes the project scope: `docs(daemon)`, `docs(fe)`.

### One commit, one topic

If a commit mixes unrelated changes, split it. Moving or renaming files and changing their content are separate commits, otherwise the diff is unreadable. Stage only what belongs to the topic and check `git status` before committing.

## What not to commit

- Hand edits to `apps/web/src/shared/api/generated.ts` or `apps/metaboxd/internal/mcp/fields.generated.go`. Edit the generator and rebuild them with `make schema`.
- Hand edits to `apps/web/src/shared/api/daemon.generated.ts`. Edit the daemon and rebuild it with `make schema-daemon`.
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
| Frontend browser tests   | `pnpm --filter web test:browser`    |
| Everything               | `make test`                         |

Run commands from the repository root. The exception is the daemon tests: there is no Go module at the root, so `go test ./...` works only from `apps/metaboxd`. `pnpm lint` works only from the root: the Tailwind plugin looks for the frontend config relative to the current directory.

Do not commit anything red.

## Hooks

`pnpm install` installs the git hooks (lefthook, config in `lefthook.yml`); `make hooks` reinstalls them.

| Hook         | What it does                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | gofmt, lint and format of the staged files; `go vet` if there are Go files; generated files only with their source  |
| `commit-msg` | commitlint                                                                                                          |
| `pre-push`   | the whole repository: `pnpm lint`, `make lint`, `pnpm format:check`, `make test`, frontend build with type checking |

A commit checks only what went into it and is fast. A push checks everything, because a change in one file can break types in another.

Use `git commit --no-verify` only when a change cannot pass a check, and explain why in the PR.

## Documentation in the commit

Documents change in the same commit as the code:

| What changes in the commit                           | What is edited                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| an acceptance criterion is met                       | the AC checkbox in section 5 of the PRD is ticked                      |
| a new technical decision is made                     | an ADR in `docs/adr/`; the PRD is edited only if a requirement changes |
| a file or directory mentioned in documents has moved | the paths in the documents                                             |

Tick an AC (acceptance criterion) checkbox only when a run confirms it: a test, CI or a measurement.

Technical decisions are recorded as ADRs (architecture decision records) in [`docs/adr/`](./docs/adr/README.md). PRD appendix A is closed to new entries.

## PR

The description says what changed and why, with links to the PRD or an ADR if the decision is recorded there.

CI runs on every PR and must be green before the merge. It runs:

- the same checks as `pre-push`, plus the frontend browser tests;
- commitlint over every commit of the PR;
- an integration run on the test bench: Apply, network reachability, LAN interception.

## Project specifics

**Daemon (`apps/metaboxd/`).** Owns the config files and the Apply cycle. A change to the API or the storage format is breaking: mark it with `!` and edit the PRD. Before editing, read the guide from the table in [`apps/metaboxd/AGENTS.md`](./apps/metaboxd/AGENTS.md). Before handing in, go through the [review checklist](./apps/metaboxd/docs/guides/ReviewChecklist.md).

**Schema (`tools/schemagen`).** The generator is the source. `apps/web/src/shared/api/generated.ts` and `apps/metaboxd/internal/mcp/fields.generated.go` are built from it. Commit the generator change together with the rebuilt files.

**Daemon contract.** `apps/web/src/shared/api/daemon.generated.ts` is printed by `apps/metaboxd/cmd/contractgen` from the daemon structures. Commit it together with the daemon change.

**Frontend (`apps/web/`).** Before editing, read the guide from the table in [`apps/web/AGENTS.md`](./apps/web/AGENTS.md). Before handing in, go through the [review checklist](./apps/web/docs/guides/ReviewChecklist.md).

**Test bench (`.devcontainer/`).** Commands and variables: [`docs/Development.md`](./docs/Development.md#test-bench).
