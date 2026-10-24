import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import { getConfigOptions, isGenericSection } from '@entities/Config';
import { parseConnectionSearch } from '@entities/Connection';
import { getTrafficHistoryOptions } from '@entities/Daemon';
import { getDataplaneOptions } from '@entities/Dataplane';
import { getDevicesOptions } from '@entities/Device';
import { DEFAULT_LOG_LEVEL, getLogTailOptions } from '@entities/Log';
import { getProxiesOptions, getProxyProvidersOptions } from '@entities/Proxy';
import { parseRuleSearch } from '@entities/Rule';
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
 * The loader waits for the screen data but does not throw on failure: a panel
 * screen must open even when the source is down. The query stays in the cache
 * with the error, and the screen block shows it.
 */
function keepFailureForScreen(): undefined {
  return undefined;
}

/** Screen skeleton threshold: a response faster than this reads as instant, and the skeleton would only flash. */
const PENDING_MS = 300;

const rootRoute = createRootRoute({ component: AppLayout, notFoundComponent: NotFoundPage });

/**
 * The start screen depends on width: from a phone people open the router to
 * check that everything works, which is the overview; at a desk they edit the
 * configuration. Width is measured at the moment of the transition, no
 * subscription is needed here.
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: matchNarrow() ? '/overview' : '/config' });
  },
});

/**
 * Configuration section: a shell with a header and a tab strip, with the tab
 * under it. Tabs are child routes, so switching between them changes one tree
 * node instead of rebuilding the whole section.
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
      'features/Rule/RuleAdd',
      'features/Rule/RuleReorder',
      'features/Rule/RuleDelete',
      'widgets/Config/ConfigSectionSettings',
      'features/Config/ConfigNodeForm',
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
        'features/RuleSet/RuleSetCustom',
        'features/Config/ConfigCacheFile',
        'features/Config/ConfigNodeForm',
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

/**
 * Sections without their own screen share one screen with a parameter: their
 * nodes open as a schema form and as text. The static `rule-set` and `raw`
 * match before the parameter, and a foreign section name is a plain 404.
 */
const configSectionRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '$section',
  beforeLoad: ({ params }) => {
    if (!isGenericSection(params.section)) {
      throw notFound();
    }
  },
  loader: async () =>
    preloadNamespaces([
      'pages/Section',
      'widgets/Config/ConfigNode',
      'widgets/Config/ConfigSectionSettings',
      'features/Config/ConfigNodeForm',
      'features/Config/ConfigNodeAdd',
      'features/Config/ConfigNodeDelete',
    ]),
  component: lazyRouteComponent(async () => import('@pages/Section'), 'SectionPage'),
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
  loader: async () =>
    preloadNamespaces([
      'pages/Connections',
      'widgets/ConnectionTable',
      'widgets/RouteExplanation',
      'features/Connection/ConnectionClose',
    ]),
  path: '/connections',
  validateSearch: parseConnectionSearch,
  component: lazyRouteComponent(async () => import('@pages/Connections'), 'ConnectionsPage'),
});

const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces(['pages/Devices', 'features/Device/DeviceRename', 'features/Device/DeviceRoute']),
      QueryClientInstance.query(getDevicesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getDataplaneOptions()).catch(keepFailureForScreen),
    ]),
  path: '/devices',
  component: lazyRouteComponent(async () => import('@pages/Devices'), 'DevicesPage'),
});

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces(['pages/Logs', 'features/Log/LogClear']),
      QueryClientInstance.query(getLogTailOptions(DEFAULT_LOG_LEVEL)).catch(keepFailureForScreen),
    ]),
  path: '/logs',
  component: lazyRouteComponent(async () => import('@pages/Logs'), 'LogsPage'),
});

/** The report is not loaded in advance: a run sends packets and starts only on the button. Nodes for selection come from the proxy. */
const diagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces(['pages/Diagnostics']),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
    ]),
  path: '/diagnostics',
  component: lazyRouteComponent(async () => import('@pages/Diagnostics'), 'DiagnosticsPage'),
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
  configLayoutRoute.addChildren([routeEditorRoute, ruleSetsRoute, rawConfigRoute, configSectionRoute]),
  proxiesRoute,
  connectionsRoute,
  devicesRoute,
  logsRoute,
  diagnosticsRoute,
  overviewRoute,
]);

/**
 * Tests replace `history`: each needs its own router with its own address,
 * while a shared instance keeps the address where the previous test stopped.
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
