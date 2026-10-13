# metabox project rules

## What this is

A GUI editor for sing-box configs on OpenWrt: a Go daemon (`apps/metaboxd`) serves an embedded SPA (`apps/web`) and owns the config files. The config schema is generated from the sing-box fork by reflection (`tools/schemagen`).

Requirements: [`docs/PRD.md`](./docs/PRD.md). A mismatch between code and the PRD is treated as a code bug until the PRD is changed explicitly.

## Projects

Each project owns its folder: code, manifest, `AGENTS.md` and guides. A project's rules are read when you work in its folder, not earlier. The root keeps what is shared across the repository: requirements, decisions, process, workspace tooling.

| Project           | Folder             | Rules                                    | Guides                                                |
| ----------------- | ------------------ | ---------------------------------------- | ----------------------------------------------------- |
| Daemon `metaboxd` | `apps/metaboxd/`   | [AGENTS.md](./apps/metaboxd/AGENTS.md)   | [docs/guides/](./apps/metaboxd/docs/guides/README.md) |
| Frontend          | `apps/web/`        | [AGENTS.md](./apps/web/AGENTS.md)        | [docs/](./apps/web/docs/README.md)                    |
| Schema generator  | `tools/schemagen/` | [AGENTS.md](./tools/schemagen/AGENTS.md) | the daemon guides, sections "Style" and "Tools"       |

## Rule sources and their priority

The canonical sources are this file, the projects' `AGENTS.md`, `docs/PRD.md` and the project guides. `CLAUDE.md`, `.claude/*`, `.cursor/*` and files of other AI products are **adapters only**: tool settings, access permissions, entry points. Do not put separate development rules in them and do not duplicate the text of the canonical sources.

On conflict, apply in this order:

1. Explicit instructions of the current task and environment constraints.
2. Code, configs and actual conventions of the affected part of the repository.
3. `docs/PRD.md`, then `AGENTS.md` (the project one before the root one), then the project guides.
4. Personal agent settings and external plugins, only where they do not weaken the repository rules.

The oh-my-claudecode plugin from `.claude/CLAUDE.md` (subagents, memory, its own commit format, skills) applies only if it does not contradict the canonical sources and its runtime is deployed in the current session. It does not override PRD requirements, and subagents do not replace solving the task directly.

## Order of studying the project

1. This file and the parts of `docs/PRD.md` relevant to the task.
2. The `AGENTS.md` of the project you work in, and the guides its condition table requires. A guide is read **in full** and before making a change.
3. Check the conclusions against the source code, manifests, build configs, linter rules and the actual directory structure.

Conclusions about architecture, commands and rules come from the repository files, not from knowledge of the stack. Not sure: open the file.

If a document disagrees with the actual code, config or linter rule, report the contradiction and agree on a decision; do not migrate the code silently.

## Where technical knowledge lives

One fact, one home; everywhere else, a link. The layer is chosen by the cost of the knowledge in context:

| Layer     | Where it lives                                                       | Cost                             | What goes there                                                     |
| --------- | -------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| Contract  | types, signatures, schemas, tests; TSDoc/godoc                       | always at hand, next to the code | behaviour and constraints that cannot be derived from the signature |
| Rule      | this file and the projects' `AGENTS.md`                              | always in context                | a standing requirement for the repository or a part of it           |
| Document  | guides in each project's `docs/`                                     | by condition from the table      | large topical rules                                                 |
| Decision  | `docs/adr/*`; requirements and decisions already made: `docs/PRD.md` | by link                          | why the system is built this way, which options were rejected       |
| Procedure | `.claude/skills/*`                                                   | by trigger                       | a repeatable scenario that is not always needed                     |

TSDoc and godoc do not retell the implementation line by line, only what the signature does not show.

Technical decisions (test bench setup, a workaround for a platform limitation, a tool choice, the architecture of a part of the system) are recorded as ADRs in `docs/adr/` with the `create-adr` skill. The repository owner sets the `Accepted` status; the agent creates a `Proposed` draft. A decision that changes a requirement edits sections 1–11 of the PRD.

PRD appendix A is closed to new entries: decisions made before ADRs were introduced moved to `docs/adr/`, and the appendix keeps only headings with links to them. Look for decisions in ADRs; do not add to appendix A.

Working notes made during tasks live in `.omc/plans/*`. These files are **not in git**: do not link to them from commits, documentation or code.

## Change principles

- Follow the architecture, naming conventions and style of the affected part of the repository; do not bring your own.
- Limit changes to the task requirements; keep the diff minimal and clear.
- No unrelated refactoring, mass renames, extra formatting or dependency updates without an explicit request.
- Do not introduce new abstractions or dependencies if the task can be solved with what the project already has.
- Keep the user's changes and do not revert them without permission. If a file changed on disk, it is usually intentional; report it instead of restoring your version.
- Speak plainly about risks, trade-offs and tech debt. Do not embellish the state of the code.
- `docs/PRD.md` is the primary source of requirements and decisions. It is edited in the same commit as the change; which change edits what is described in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Commits

Message format, scopes, branches, PRs and additional requirements for agents: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## General

- When working with libraries, frameworks and their APIs, use the Context7 MCP. The server is declared in `.mcp.json`; the key comes from the `CONTEXT7_API_KEY` variable. Get your own at context7.com and put it in `.claude/settings.local.json` (the file is in `.gitignore`):

  ```json
  { "env": { "CONTEXT7_API_KEY": "your-key" } }
  ```

  Do not write the key into `.mcp.json` itself: that file is committed.

- Other MCP servers from `.mcp.json`:

  | Server            | Purpose                                                           |
  | ----------------- | ----------------------------------------------------------------- |
  | `playwright`      | e2e: checking the interface and user scenarios                    |
  | `chrome-devtools` | interface performance, console, network, measurements, screenshot |

- Run linters and tests yourself and quote the result as is; do not paraphrase it.
- A new dependency only when there is no way around it; justify it.
- Dependency versions are pinned exactly, without `^` and `~`: a range gives different trees on a developer machine and in CI. `saveExact: true` in the root `pnpm-workspace.yaml` enforces this; a range typed by hand is caught by `pnpm install --frozen-lockfile` in CI, because the lockfile stores the specifier and diverges from the manifest. A version update is a separate, deliberate change.
- `apps/web/src/shared/api/generated.ts` is not edited by hand; the generator is. Writing to it is blocked in `.claude/settings.json`.
- The repository language is English: code, comments, commit messages, documentation, ADRs, the PRD. README, CONTRIBUTING and docs/Development have Russian copies (`README.ru.md`, `CONTRIBUTING.ru.md`, `docs/Development.ru.md`), updated in the same commit as the English file. Text shown to users lives in the i18n dictionaries, in English and Russian. Known exception: daemon error texts shown in the panel stay in Russian until they move to i18n.
- Personal settings that are not shared through git go into `AGENTS.local.md` (response formats, your own triggers, aliases). The file is ignored in `.gitignore` by the `*.local.*` pattern.

## Context hygiene

- Development rules live only in `AGENTS.md`. `.claude/*`, `.cursor/*`, `.vscode/*` hold tool settings only: permissions, MCP, formatting, entry points.
- Do not copy repository rules into the agent's global user instructions, or the other way round.
- Do not duplicate the same list of paths in several configs without need: permissions are currently set in one place, `.claude/settings.json`.
- Connect external plugins only when their features are actually needed; do not describe their behaviour in the canonical sources.
