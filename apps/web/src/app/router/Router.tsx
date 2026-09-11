import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router';

import { AppLayout } from '../ui/AppLayout';

/**
 * Маршруты объявлены кодом, а не файлами: файловый роутинг завёл бы вторую
 * структуру каталогов поверх слоёв FSD и генерируемое дерево маршрутов в git.
 *
 * Экран подключается только тогда, когда он сделан: маршрут-заглушка в меню
 * неотличим от готового раздела и врёт о состоянии панели.
 */
const rootRoute = createRootRoute({ component: AppLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/config' });
  },
});

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/config',
  component: lazyRouteComponent(async () => import('@pages/Editor'), 'EditorPage'),
});

const proxiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/proxies',
  component: lazyRouteComponent(async () => import('@pages/Proxies'), 'ProxiesPage'),
});

const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connections',
  component: lazyRouteComponent(async () => import('@pages/Connections'), 'ConnectionsPage'),
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/overview',
  component: lazyRouteComponent(async () => import('@pages/Overview'), 'OverviewPage'),
});

const rawConfigRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/config/raw',
  component: lazyRouteComponent(async () => import('@pages/RawConfig'), 'RawConfigPage'),
});

export const Router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    configRoute,
    rawConfigRoute,
    proxiesRoute,
    connectionsRoute,
    overviewRoute,
  ]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof Router;
  }
}
