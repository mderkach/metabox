# ADR-0073. Share agent skills and keep native client adapters

- Status: Proposed
- Date: 2026-11-02
- Deciders: Repository owner

## Context and problem statement

The repository configures Claude Code through import-only `CLAUDE.md` files, development MCP servers, tool permissions and project skills. Codex already reads the canonical `AGENTS.md` files, but it needs its own MCP configuration and skill discovery entry point. Claude's OMC runtime and tool permission model are client-specific.

Product requirements in the [PRD](../PRD.md) are unchanged. The scope is local development tooling, with no connection to a production router.

## Decision drivers

- Keep project rules and procedures in one authoritative location.
- Make the existing development servers discoverable in Codex without storing credentials.
- Preserve Claude compatibility and existing tool versions and launch arguments.
- Describe enforcement and runtime differences explicitly.

## Considered options

1. **Native Codex config and shared skill links. Chosen.** Check in `.codex/config.toml` and expose the portable ADR skill through `.agents/skills`. This uses supported discovery while keeping one copy of the procedure. MCP declarations must be maintained in two client formats.
2. **Keep user-only setup. Rejected.** Each contributor can register servers and skills globally. This avoids another tracked config but makes project setup depend on undocumented personal state.
3. **Generate both client configs from a new shared manifest. Rejected.** This could prevent MCP drift, but adds a generator and a new configuration format for three server declarations.

## Decision outcome

Use [`.codex/config.toml`](../../.codex/config.toml) to declare the same three development MCP servers as [`.mcp.json`](../../.mcp.json), using `env_http_headers` for the Context7 credential. Keep model and plugin selection user-owned. Use `workspace-write` and approvals on request.

Keep the portable `create-adr` procedure and its reference in `.agents/skills/create-adr`, with a relative directory symlink at `.claude/skills/create-adr` for Claude compatibility. The view-transition skill already uses the shared directory. Keep the root and nested `AGENTS.md` files as the instruction sources.

Do not copy Claude's OMC hook, wiki, command allowlist or tool-specific denials into settings with different semantics. The Codex adapter does not provide equivalent secret read or generated-file edit denials. Record setup and limitations in the paired development guides. No plugin installation or global configuration change is part of this setup.

## Consequences

### Positive

- Codex gets repository-scoped MCP registration and the existing ADR procedure.
- Claude keeps its current entry points and behavior.
- Credentials remain outside tracked configuration.

### Negative

- MCP server declarations can drift between the two config formats.
- Claude skill discovery requires a checkout that preserves directory symlinks; Codex reads the shared skill as regular files.
- Codex's workspace sandbox does not replicate Claude's per-tool file restrictions; sensitive files must be kept outside the worktree.
- The inherited Chrome DevTools `@latest` tag remains unpinned; changing it is a separate tool-version update.

### Neutral or deferred

- OMX and OMC installation remains user-owned.
- Runtime connectivity depends on credentials, browser availability and client permissions.

## Compatibility, migration and rollback

No runtime application data, API or generated files change. Trust the project and start a fresh Codex chat to discover the config and skills. The frontend guide table routes visual work to `apps/web/DESIGN.md` and test work to the existing testing guide, including the Node tooling project. Existing personal MCP registrations can be shadowed by project entries of the same name; inspect the effective registration before using them. Roll back by removing the Codex config and associated documentation changes, then moving the shared ADR skill back to `.claude/skills/create-adr` and removing the compatibility link first. The procedure and its reference are unchanged by the move.

## Validation

- Parse the TOML and compare the three server declarations with `.mcp.json`, including the Context7 environment header mapping.
- Run `codex mcp list` from the worktree to validate registration without connecting to servers.
- Resolve the skill symlink and its companion `ADR-reference.md` inside the checkout.
- Run the repository linter, check formatting of changed Markdown, and run `git diff --check`.
- In a fresh trusted Codex session, check skill discovery and invoke a read-only tool from each MCP server. Registration alone is not evidence of connectivity.

## Links

- [Project rules](../../AGENTS.md)
- [Development setup](../Development.md#codex)
- [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex skills](https://learn.chatgpt.com/docs/build-skills)
