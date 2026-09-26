import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { z } from 'zod';

import { getConfigOptions } from '@entities/Config';
import { parseConnectionSearch } from '@entities/Connection';
import { getTrafficHistoryOptions } from '@entities/Daemon';
import { getProxiesOptions, getProxyProvidersOptions } from '@entities/Proxy';
import { getRuleSetCatalogOptions } from '@entities/RuleSet';
import { QueryClientInstance } from '@shared/api';
import { matchNarrow } from '@shared/lib/media';

import { preloadNamespaces } from '../lib/i18n';
import { AppLayout } from '../ui/AppLayout';
import { ConfigLayout } from '../ui/ConfigLayout';
import { ErrorPage } from '../ui/ErrorPage';
import { NotFoundPage } from '../ui/NotFoundPage';
import { PendingPage } from '../ui/PendingPage';
import { toPageTransitionTypes } from './Router.transition';

/**
 * Загрузчик ждёт данные экрана, но отказ не бросает: экран панели обязан
 * открыться и при лежащем источнике. Запрос остаётся в кэше с ошибкой, и её
 * показывает блок экрана.
 */
function keepFailureForScreen(): undefined {
  return undefined;
}

/** Порог скелетона экрана: быстрее этого ответ читается как мгновенный, и скелетон только мигнул бы. */
const PENDING_MS = 300;

const rootRoute = createRootRoute({ component: AppLayout, notFoundComponent: NotFoundPage });

/**
 * Стартовый экран зависит от ширины: с телефона на роутер заходят проверить,
 * что всё работает, — это обзор; за столом правят конфигурацию. Ширина
 * замеряется в момент перехода, подписка здесь не нужна.
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: matchNarrow() ? '/overview' : '/config' });
  },
});

/**
 * Номер правила в адресе: экран соединений ведёт на сработавший узел, и без
 * параметра переход открывал бы просто список. Номер — как в UI,
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
  loader: async () =>
    Promise.all([
      preloadNamespaces(['widgets/Config/ConfigTabs', 'widgets/Config/ConfigBuildNotice']),
      QueryClientInstance.query(getConfigOptions()).catch(keepFailureForScreen),
    ]),
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
    Promise.all([
      preloadNamespaces([
        'pages/RuleSets',
        'widgets/RuleSet/RuleSetTable',
        'features/RuleSet/RuleSetAdd',
        'features/Config/ConfigCacheFile',
      ]),
      QueryClientInstance.query(getRuleSetCatalogOptions()).catch(keepFailureForScreen),
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
  loader: async () =>
    Promise.all([
      preloadNamespaces(['pages/Proxies', 'widgets/ProxyGroups']),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getProxyProvidersOptions()).catch(keepFailureForScreen),
    ]),
  path: '/proxies',
  component: lazyRouteComponent(async () => import('@pages/Proxies'), 'ProxiesPage'),
});

const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () => preloadNamespaces(['pages/Connections', 'widgets/ConnectionTable', 'widgets/RouteExplanation']),
  path: '/connections',
  validateSearch: parseConnectionSearch,
  component: lazyRouteComponent(async () => import('@pages/Connections'), 'ConnectionsPage'),
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([
        'pages/Overview',
        'widgets/ConnectionSummary',
        'widgets/ConnectionHistory',
        'widgets/Daemon/DaemonService',
        'widgets/Daemon/DaemonTraffic',
        'widgets/ProxyLatency',
      ]),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getTrafficHistoryOptions()).catch(keepFailureForScreen),
    ]),
  path: '/overview',
  component: lazyRouteComponent(async () => import('@pages/Overview'), 'OverviewPage'),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  configLayoutRoute.addChildren([routeEditorRoute, ruleSetsRoute, rawConfigRoute]),
  proxiesRoute,
  connectionsRoute,
  overviewRoute,
]);

/**
 * `history` подменяют тесты: каждому нужен свой роутер со своим адресом —
 * общий экземпляр хранит адрес, на котором остановился предыдущий тест.
 */
export function createPanelRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultViewTransition: { types: toPageTransitionTypes },
    defaultPendingMs: PENDING_MS,
    defaultPendingComponent: PendingPage,
    defaultErrorComponent: ErrorPage,
  });
}

export const Router = createPanelRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof Router;
  }
}
