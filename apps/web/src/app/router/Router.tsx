import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { EditorPage } from '@pages/Editor';

/**
 * Маршруты объявлены кодом, а не файлами: файловый роутинг завёл бы вторую
 * структуру каталогов поверх слоёв FSD и генерируемое дерево маршрутов в git.
 */
const rootRoute = createRootRoute({ component: Outlet });

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: EditorPage,
});

export const Router = createRouter({
  routeTree: rootRoute.addChildren([editorRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof Router;
  }
}
