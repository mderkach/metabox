# Schema generator rules

Shared repository rules are in the root [`AGENTS.md`](../../AGENTS.md). This file covers only `tools/schemagen/`.

The generator is a separate Go module: it pulls the sing-box fork with its whole dependency tree, which has no place in the shipped artifact. It is not a showcase of style: it builds the schema from foreign types by reflection and lives by the fork's rules.

## When to read the guides

The guides live with the daemon. Only two sections of [Architecture&Style.md](../../apps/metaboxd/docs/guides/Architecture&Style.md) are mandatory here: "Style" and "Tools". The rest applies to the daemon and does not extend to the generator.

Before editing tests: [Testing.md](../../apps/metaboxd/docs/guides/Testing.md).

## Changes in `tools/schemagen/`

- The generator's artifacts are `apps/web/src/shared/api/generated.ts` and the MCP field reference `apps/metaboxd/internal/mcp/fields.generated.go`. They are committed together with the generator change, otherwise the frontend or the agent diverges from the schema; the pre-commit hook checks this.
- Build, run and tests only through `make schema` and `make test-schemagen`: without the fork's tags and `-ldflags` the module does not build.
