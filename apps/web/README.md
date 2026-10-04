# web — SPA metabox

React 19 + TypeScript + Vite. Сборка кладётся в `apps/web/dist` и вшивается в демон (`apps/metaboxd`).

Пакет воркспейса. Команды — в `scripts` из `package.json`: `dev`, `build`, `test`; из корня репозитория они запускаются как `pnpm --filter web <скрипт>`. Линт и форматирование общие на репозиторий и запускаются только из корня — `pnpm lint` и `pnpm format`; своего скрипта `lint` у пакета нет.

Правила фронтенда — [`AGENTS.md`](./AGENTS.md), гайды — [`docs/`](./docs/README.md), требования продукта — [`docs/PRD.md`](../../docs/PRD.md).
