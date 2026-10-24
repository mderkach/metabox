# ADR-0063. Serve MCP agents a field reference generated from the fork schema

- Status: Proposed
- Date: 2026-10-24
- Deciders: repository owner

## Context and problem statement

An MCP agent reads config versions through `metabox_config_version` ([ADR-0055](./ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md)) but has no way to learn what a field is: its type, the values an enum allows, which node a tag names, which `type` of an outbound has the field. It guesses from the field name or from upstream sing-box documentation, which differs from the `sing-box-extended` fork the panel targets ([ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md)). ADR-0055 deferred "a field reference for agents, generated from the fork schema with manual notes"; issue #56 asks for it.

Facts the decision depends on:

- `tools/schemagen` already holds every field's type, the enum and discriminator values, the fork godoc and the tag references as an intermediate tree before printing Zod ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)). It is a separate module because it links the fork; the daemon cannot import it.
- The daemon boundary "the schema lives on the frontend; we do not write a config model in Go" ([`Architecture&Style.md`](../../apps/metaboxd/docs/guides/Architecture&Style.md), "Boundaries"). The daemon does not parse config contents.
- The phase-1 MCP surface is tools only, registered through one wrapper with logging and `recover` (`apps/metaboxd/internal/mcp/mcp.go`); tests go through an SDK client session.
- The fork schema is recursive (logical rules hold rules, bond and failover outbounds hold outbounds), repeats whole shapes (an endpoint holds an outbound, TLS and dial fields sit under dozens of node types), and gives one key different values in different forms: `outbounds.*.outbounds` is a list of tags for `selector`, of outbounds for `failover` and of bond members for `bond`.
- Measured on 2026-10-24, `linux/arm64`, `-trimpath -ldflags "-s -w"`: the daemon is 10 682 528 bytes.
- Daemon texts the agent receives are in the operator's language: tool descriptions and errors go through the English-keyed catalogue of [ADR-0062](./ADR-0062-translate-operator-texts-with-an-english-keyed-catalogue-chosen-in-uci.md), while descriptions that come from struct tags stay English.

In scope: where the reference comes from, how the daemon gets it, its shape, how the agent asks for it, where hand-written notes live. Out of scope: write through MCP (phase 2), validating config contents, the panel.

## Decision drivers

- One source of truth: the reference is the same schema the panel forms use, not a second hand-written one.
- The daemon stays without a config model and without parsing config contents.
- Answers are exact for recursive, repeated and mixed shapes: a wrong answer stated with confidence is worse than none.
- The agent can ask about a path copied from a real config (`route.rules.3.outbound`).
- Binary growth stays small next to the 2.2 MB the SDK was allowed (ADR-0055).
- Notes the schema cannot express are edited without touching Go code and reach the agent in the operator's language.
- Follows the phase-1 pattern: tool wrapper, read-only annotation, SDK client tests.

## Considered options

### How the daemon gets the reference

1. **The generator prints a Go file of static data into `internal/mcp`.** `make schema` writes `fields.generated.go` next to `generated.ts`. Static data: no code runs at start, no parsing, compile-time checked. Drawbacks: a second generated artifact; a fork update regenerates it. **Chosen.**
2. **The generator prints JSON, the daemon embeds and parses it.** Same data; `oxfmt` checks committed JSON formatting, and the daemon parses it at start. No advantage over static Go data. **Rejected.**
3. **The daemon reads `generated.ts` or the Zod JSON schema.** Reading it means parsing TypeScript or running Zod; the daemon would interpret the schema it is not supposed to model. **Rejected.**
4. **Keep the current approach**: the agent guesses from names and upstream docs, which differ from the fork. **Rejected**: it is the problem.

### The shape of the reference

1. **A table with one entry per path.** Simple lookup. Every path of the schema: 5 919 entries, the binary grows by 1.24 MB. Folding a repeated shape into its first place brought it to +459 KB, but one path then has several shapes and one fold target: a review found keys of other forms under `fallback_for_alpn.{}` and bond member fields unreachable under `outbounds.*.outbounds.*`. **Rejected.**
2. **A graph: a node per value shape, an edge per object key.** A named schema is one node wherever it appears, an anonymous shape is shared with an identical one; an edge carries the key, the value node, the referenced node kind, the fork comment and the discriminator values of the forms that have the key; a key with different values in different forms has one edge per value. The daemon resolves a path by walking the graph from the root with the set of nodes reached so far. Recursion, repetition and mixed forms need no special case. 220 nodes and 1 857 edges, the binary grows by 320 KB. Drawback: about a hundred lines of walking in the daemon. **Chosen.**

### How the agent asks

1. **A tool `metabox_config_field` with a `path` argument.** The phase-1 surface is tools; clients such as Claude Code offer tools to the model without extra steps; a path argument with index normalisation needs code anyway. **Chosen.**
2. **MCP resources, one per path or a resource template.** Resources are listed separately and many clients do not put them into the model's context without the user picking them; a template still needs the same resolution code, and the wrapper with logging and `recover` exists only for tools. **Rejected** for phase 1.

## Decision outcome

- `tools/schemagen` builds the schema once and prints two artifacts: `apps/web/src/shared/api/generated.ts` and `apps/metaboxd/internal/mcp/fields.generated.go`. `make schema` writes both; `make test-schemagen` fails when the committed Go file differs from the generator output and when a leaf expression cannot be described; the pre-commit hook requires a generator change next to either file, and the fork release workflow commits both.
- The Go file holds the graph above as static data: nodes with the type in words and the enum or discriminator values, edges with key, node, reference, condition and comment.
- Hand-written notes live in `apps/metaboxd/internal/mcp/fieldnotes.json`, keyed by config path and then by language (`en`, `ru`), embedded into the binary; a test fails on a note without one of the languages. The tool description and its errors go through the catalogue; type words and fork comments come from the schema and stay English, like the struct-tag descriptions of ADR-0062. The daemon resolves each note path to the node and key that lead to it, so a note follows its field into recursive and shared shapes; a note whose path does not resolve makes the tool return an error, and a test catches it first.
- The read-only tool `metabox_config_field` resolves a path as written in a config (a number is an array index, a key is read as an object key and as a map key) and returns the type, values, reference, the discriminator conditions met along the path (`when`, each with the path it applies to), the fork comment, the note and the keys under the path. An unknown key is a tool error naming the deepest known prefix. It reads nothing from the router.
- The reference is data for the agent: the daemon never checks or parses a config with it, so the boundary of `Architecture&Style.md` holds.

### Scope and boundaries

`tools/schemagen/fieldref.go`, `tools/schemagen/main.go`, `Makefile` (`schema`), `lefthook.yml`, `.github/workflows/fork-release-watch.yml`, `apps/metaboxd/internal/mcp/fields.go`, `fields.generated.go`, `fieldnotes.json`, `tools.go`.

## Consequences

### Positive

- The agent learns types, allowed values and references of the fork it actually talks to, and which `type` along the path has a field.
- One schema walk feeds both the panel and the agent; a fork update reaches the agent with `make schema`.
- Notes are text in a data file, in both operator languages.

### Negative

- The binary grows by about 320 KB on `arm64`.
- A second generated artifact to commit with generator changes.
- When a path reaches the same node in several ways, their conditions merge: only conditions every way shares are kept, with their values added up.
- A path into an array or map of scalars is not resolved: the agent asks for the array itself.
- The `Architecture&Style.md` boundary now has a generated, read-only description of the schema in Go; it is not a model the daemon works with.

### Neutral or deferred

- MCP resources.
- Write through MCP (phase 2, ADR-0055).

## Risks and mitigations

| Risk                                                      | Likelihood and impact         | Mitigation                                                                     |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| The committed reference drifts from the generator         | medium likelihood, low impact | `make test-schemagen` compares the committed file with the generator output    |
| A note outlives the field after a fork update             | medium likelihood, low impact | the daemon test resolves every note path                                       |
| A note states behaviour the fork does not have            | low likelihood, medium impact | notes are written from the fork sources and docs and name the sing-box version |
| The reference grows with the fork past an acceptable size | low likelihood, low impact    | the size is measured in the PR that updates the fork                           |

## Compatibility, migration and rollback

Backward compatible: a new tool; existing tools, the panel and the REST API do not change. Rollback is reverting the change; nothing is stored on the device.

## Validation

- `make test-schemagen`: the committed reference equals the generator output; known keys carry the expected type, values, reference and condition; a synthetic recursive schema with one key holding two different values gives one edge per value and a self-reference; a form without the discriminator puts no condition; an unknown leaf expression fails generation.
- `cd apps/metaboxd && go test -race ./...`: `metabox_config_field` through an SDK client session resolves indices, map keys and recursive rules, keeps the conditions of the form a shared shape sits in, reaches both forms of `outbounds.*.outbounds.*`, returns notes, rejects an unknown key; every note path resolves; the tool is read-only.
- `make lint`.
- Size: `GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w"` before and after.

## Links

- [`../PRD.md`](../PRD.md): section 5, "MCP server", AC-71…AC-73, AC-76;
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), [ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md), [ADR-0055](./ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md), [ADR-0062](./ADR-0062-translate-operator-texts-with-an-english-keyed-catalogue-chosen-in-uci.md);
- [`../../tools/schemagen/fieldref.go`](../../tools/schemagen/fieldref.go), [`../../apps/metaboxd/internal/mcp/fields.go`](../../apps/metaboxd/internal/mcp/fields.go), [`../../apps/metaboxd/internal/mcp/fieldnotes.json`](../../apps/metaboxd/internal/mcp/fieldnotes.json);
- [`../../apps/metaboxd/docs/guides/HTTPAPI.md`](../../apps/metaboxd/docs/guides/HTTPAPI.md), section "MCP";
- issue #56 of `mderkach/metabox`.
