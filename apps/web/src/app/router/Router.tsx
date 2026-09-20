import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { preloadNamespaces } from '../lib/i18n';
import { AppLayout } from '../ui/AppLayout';
import { ConfigLayout } from '../ui/ConfigLayout';
import { NotFoundPage } from '../ui/NotFoundPage';
import { toPageTransitionTypes } from './Router.transition';

const rootRoute = createRootRoute({ component: AppLayout, notFoundComponent: NotFoundPage });

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

/**
 * Раздел конфигурации: оболочка с шапкой и полосой вкладок, под ней вкладка.
 * Вкладки — дочерние маршруты, поэтому переход между ними меняет один узел
 * дерева, а не пересобирает раздел целиком.
 */
const configLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () => preloadNamespaces(['widgets/Config/ConfigTabs']),
  path: '/config',
  component: ConfigLayout,
});

const routeEditorRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () =>
    preloadNamespaces([
      'pages/Editor',
      'widgets/Rule/RuleTable',
      'widgets/Rule/RulePanel',
      'features/Rule/RuleEdit',
      'features/Rule/RuleRaw',
    ]),
  path: '/',
  validateSearch: parseRuleSearch,
  component: lazyRouteComponent(async () => import('@pages/Editor'), 'EditorPage'),
});

const ruleSetsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () =>
    preloadNamespaces([
      'pages/RuleSets',
      'widgets/RuleSet/RuleSetTable',
      'features/RuleSet/RuleSetAdd',
      'features/Config/ConfigCacheFile',
    ]),
  path: 'rule-set',
  component: lazyRouteComponent(async () => import('@pages/RuleSets'), 'RuleSetsPage'),
});

const rawConfigRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () => preloadNamespaces(['pages/RawConfig', 'widgets/Config/ConfigRawEditor']),
  path: 'raw',
  component: lazyRouteComponent(async () => import('@pages/RawConfig'), 'RawConfigPage'),
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

export const Router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    configLayoutRoute.addChildren([routeEditorRoute, ruleSetsRoute, rawConfigRoute]),
    proxiesRoute,
    connectionsRoute,
    overviewRoute,
  ]),
  defaultViewTransition: { types: toPageTransitionTypes },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof Router;
  }
}
