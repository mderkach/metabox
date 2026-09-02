# web — SPA metabox

React 19 + TypeScript + Vite. Сборка кладётся в `web/dist` и вшивается в демон (`cmd/metaboxd`).

Команды — в `scripts` из `package.json`: `dev`, `build`, `lint`, `lint:deps`, `format`, `test`. Запускать из этого каталога (`cd web && pnpm build`): в корне монорепо нет `package.json`, и corepack не увидит закреплённую версию pnpm.

Правила фронтенда — [`AGENTS.md`](./AGENTS.md), гайды — [`docs/`](./docs/README.md), требования продукта — [`docs/PRD.md`](../docs/PRD.md).
