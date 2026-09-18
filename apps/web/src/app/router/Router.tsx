import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { preloadNamespaces } from '../lib/i18n';
import { AppLayout } from '../ui/AppLayout';

/**
 * Маршруты объявлены кодом, а не файлами: файловый роутинг завёл бы вторую
 * структуру каталогов поверх слоёв FSD и генерируемое дерево маршрутов в git.
 *
 * Экран подключается только тогда, когда он сделан: маршрут-заглушка в меню
 * неотличим от готового раздела и врёт о состоянии панели.
 *
 * Словари экрана догружает `loader` вместе с его кодом: без этого первый кадр
 * маршрута уходит в `Suspense` и показывает заглушку вместо текста. Неймспейсы
 * оболочки в списках не повторяются — их грузит вход приложения.
 */
const rootRoute = createRootRoute({ component: AppLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/config' });
  },
});

/**
 * Номер правила в адресе: экран соединений ведёт на сработавший узел, и без
 * параметра переход открывал бы просто список (ADR-0007). Номер — как в UI,
 * с единицы; значение, которое не похоже на номер, отбрасывается.
 */
const RuleSearchSchema = z.object({
  rule: z.coerce.number().int().positive().optional(),
});

function parseRuleSearch(search: Record<string, unknown>): { rule?: number } {
  const parsed = RuleSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    preloadNamespaces([
      'pages/Editor',
      'widgets/Config/ConfigTabs',
      'widgets/Rule/RuleTable',
      'widgets/Rule/RulePanel',
      'features/Rule/RuleEdit',
      'features/Rule/RuleRaw',
    ]),
  path: '/config',
  validateSearch: parseRuleSearch,
  component: lazyRouteComponent(async () => import('@pages/Editor'), 'EditorPage'),
});

const ruleSetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    preloadNamespaces([
      'pages/RuleSets',
      'widgets/Config/ConfigTabs',
      'widgets/RuleSet/RuleSetTable',
      'features/RuleSet/RuleSetAdd',
      'features/Config/ConfigCacheFile',
    ]),
  path: '/config/rule-set',
  component: lazyRouteComponent(async () => import('@pages/RuleSets'), 'RuleSetsPage'),
});

const proxiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () => preloadNamespaces(['pages/Proxies', 'widgets/ProxyGroups']),
  path: '/proxies',
  component: lazyRouteComponent(async () => import('@pages/Proxies'), 'ProxiesPage'),
});

const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () => preloadNamespaces(['pages/Connections', 'widgets/ConnectionTable', 'widgets/RouteExplanation']),
  path: '/connections',
  component: lazyRouteComponent(async () => import('@pages/Connections'), 'ConnectionsPage'),
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    preloadNamespaces([
      'pages/Overview',
      'widgets/ConnectionSummary',
      'widgets/ConnectionHistory',
      'widgets/Daemon/DaemonService',
      'widgets/Daemon/DaemonTraffic',
      'widgets/ProxyLatency',
    ]),
  path: '/overview',
  component: lazyRouteComponent(async () => import('@pages/Overview'), 'OverviewPage'),
});

const rawConfigRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () => preloadNamespaces(['pages/RawConfig', 'widgets/Config/ConfigRawEditor']),
  path: '/config/raw',
  component: lazyRouteComponent(async () => import('@pages/RawConfig'), 'RawConfigPage'),
});

export const Router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    configRoute,
    ruleSetsRoute,
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
