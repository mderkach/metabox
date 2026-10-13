# web: the metabox SPA

React 19 + TypeScript + Vite. The build goes to `apps/web/dist` and is embedded into the daemon (`apps/metaboxd`).

A workspace package. Commands are in `scripts` of `package.json`: `dev`, `build`, `test`; from the repository root they run as `pnpm --filter web <script>`. Lint and formatting are shared across the repository and run only from the root: `pnpm lint` and `pnpm format`; the package has no `lint` script of its own. `lint:react` gives react-doctor advice: CI runs it as a step that does not fail the build.

Frontend rules: [`AGENTS.md`](./AGENTS.md); guides: [`docs/`](./docs/README.md); product requirements: [`docs/PRD.md`](../../docs/PRD.md).
