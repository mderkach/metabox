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

The canonical sources are this file, the projects' `AGENTS.md`, `docs/PRD.md` and the project guides. `CLAUDE.md`, `.claude/*`, `.codex/*`, `.cursor/*`, `.vscode/*` and files of other AI products are **adapters only**: tool settings, access permissions, entry points. Do not put separate development rules in them and do not duplicate the text of the canonical sources.

On conflict, apply in this order:

1. Explicit instructions of the current task and environment constraints.
2. Code, configs and actual conventions of the affected part of the repository.
3. `docs/PRD.md`, then `AGENTS.md` (the project one before the root one), then the project guides.
4. Personal agent settings and external plugins, only where they do not weaken the repository rules.

Client-specific plugins and orchestration adapters apply only when their runtime is available and they do not contradict the canonical sources. Keep their setup in the client adapter; they do not override PRD requirements.

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
| Procedure | `.agents/skills/*`; client-specific skills in `.claude/skills/*`     | by trigger                       | a repeatable scenario that is not always needed                     |

TSDoc and godoc do not retell the implementation line by line, only what the signature does not show.

A code comment is written in two cases only: a contract the signature does not show (TSDoc, godoc), or a non-obvious "why": a bug workaround, a protocol requirement, a link to an issue. One or two sentences; a longer explanation belongs in an ADR or a guide. Not allowed: retelling the neighbouring line, section headers and separators, `Note:` / `Important:`, traces of the edit ("now", "previously", "added", `v2`), a TODO without an addressee, commented-out code. A comment does not state a rule: the rule lives in `AGENTS.md` or a guide.

Links go from documents to code, not back. Code, comments included, does not name an ADR, a requirement ID (`AC-N`, `NFR-N`, `UX-N`) or the PRD: it says what breaks and why. A requirement names the check that confirms it in [`docs/Verification.md`](./docs/Verification.md), a decision names the code it governs in the "Validation" section of its ADR. `make trace-check` enforces both on pre-push and in CI ([ADR-0076](./docs/adr/ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md)).

Technical decisions (test bench setup, a workaround for a platform limitation, a tool choice, the architecture of a part of the system) are recorded as ADRs in `docs/adr/` with the `create-adr` skill. The repository owner delegated acceptance to the agent: it creates the ADR as `Proposed` and may set `Accepted` itself. Either way, the hand-in carries a summary for a reader without the task context: what was decided, which options were rejected and what changes for the owner, with every code and abbreviation expanded. A decision that changes a requirement edits sections 1–11 of the PRD.

PRD appendix A is closed to new entries: decisions made before ADRs were introduced moved to `docs/adr/`, and the appendix keeps only headings with links to them. Look for decisions in ADRs; do not add to appendix A.

Working notes made during tasks live in `.omc/plans/*`. These files are **not in git**: do not link to them from commits, documentation or code.

## Change principles

- Follow the architecture, naming conventions and style of the affected part of the repository; do not bring your own.
- Limit changes to the task requirements; keep the diff minimal and clear.
- No unrelated refactoring, mass renames, extra formatting or dependency updates without an explicit request.
- Do not introduce new abstractions or dependencies if the task can be solved with what the project already has.
- Keep the user's changes and do not revert them without permission. If a file changed on disk, it is usually intentional; report it instead of restoring your version.
- Speak plainly about risks, trade-offs and tech debt. Do not embellish the state of the code.
- Deferred work and a rule violation that is found but not fixed become a GitHub issue with the `techdebt` label, not a line in the reply. The repository is public: device addresses, keys and logs with personal data do not go into an issue.
- `docs/PRD.md` is the primary source of requirements and decisions. It is edited in the same commit as the change; which change edits what is described in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Commits

Message format, scopes, branches and PRs: [`CONTRIBUTING.md`](./CONTRIBUTING.md). An agent writes the same one-line message as a person, and in addition:

- Commits, pushes, opens a PR and merges only on explicit request or when the task was delegated through an orchestrator. Even then, it confirms how far to go: a local branch, a pushed branch, a PR or a merge. Without a request, changes stay in the working tree, and the response lists what was changed.
- Works on a branch: if the current one is `main`, creates a branch first.
- Stages files by name, never by directory. Files that were already staged before the task began are not its own: it leaves them out of the commit (`git commit -- <paths>`) and reports them.
- Before committing, runs the checks of the affected part and quotes the result as is.
- Keeps one topic per commit. If the diff is mixed, proposes a split and waits for a decision.
- Does not rewrite history: `amend`, `rebase` and force-push only on direct request.

## General

- When working with libraries, frameworks and their APIs, use the Context7 MCP. The server is declared in `.mcp.json` for Claude Code and `.codex/config.toml` for Codex; the key comes from the `CONTEXT7_API_KEY` variable. For Codex, export it in the environment before starting the client (see [Development](./docs/Development.md#codex)). For Claude Code, get your own at context7.com and put it in `.claude/settings.local.json` (the file is in `.gitignore`):

  ```json
  { "env": { "CONTEXT7_API_KEY": "your-key" } }
  ```

  Do not write the key into either committed MCP config.

- Other MCP servers from these configs:

  | Server            | Purpose                                                           |
  | ----------------- | ----------------------------------------------------------------- |
  | `playwright`      | e2e: checking the interface and user scenarios                    |
  | `chrome-devtools` | interface performance, console, network, measurements, screenshot |

- Run linters and tests yourself and quote the result as is; do not paraphrase it.
- A new dependency only when there is no way around it; justify it.
- Dependency versions are pinned exactly, without `^` and `~`: a range gives different trees on a developer machine and in CI. `saveExact: true` in the root `pnpm-workspace.yaml` enforces this; a range typed by hand is caught by `pnpm install --frozen-lockfile` in CI, because the lockfile stores the specifier and diverges from the manifest. A version update is a separate, deliberate change.
- Generated files are not edited by hand; their generators are: `apps/web/src/shared/api/generated.ts` and `apps/metaboxd/internal/mcp/fields.generated.go` (`make schema`), `apps/web/src/shared/api/daemon.generated.ts` (`make schema-daemon`), `apps/web/src/i18n.generated.d.ts` (`pnpm --filter web gen:i18n`). `.claude/settings.json` blocks Claude's edits to them; for other clients the pre-commit hook and the freshness tests in `make test` catch a hand edit.
- The repository language is English: code, comments, commit messages, documentation, ADRs, the PRD. README, CONTRIBUTING, docs/Development and docs/Maintaining have Russian copies (`README.ru.md`, `CONTRIBUTING.ru.md`, `docs/Development.ru.md`, `docs/Maintaining.ru.md`), updated in the same commit as the English file. Text shown to users lives in the i18n dictionaries, in English and Russian.
- Personal settings that are not shared through git go into `AGENTS.local.md` (response formats, your own triggers, aliases). The file is ignored in `.gitignore` by the `*.local.*` pattern.

## Context hygiene

- Do not copy repository rules into the agent's global user instructions, or the other way round.
- Do not duplicate the same list of paths in several configs without need. Claude tool permissions live in `.claude/settings.json`; Codex uses its own sandbox settings in `.codex/config.toml`. Their enforcement differs; see [Development](./docs/Development.md#codex).
- Connect external plugins only when their features are actually needed; do not describe their behaviour in the canonical sources.
