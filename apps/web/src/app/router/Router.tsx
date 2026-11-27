import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  linkOptions,
  notFound,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import {
  CONFIG_SECTION,
  getConfigOptions,
  isGenericSection,
  parseSectionSearch,
  type GenericSection,
} from '@entities/Config';
import { parseConnectionSearch } from '@entities/Connection';
import { getTrafficHistoryOptions } from '@entities/Daemon';
import { getDataplaneOptions } from '@entities/Dataplane';
import { getDevicesOptions } from '@entities/Device';
import { DEFAULT_LOG_LEVEL, getLogTailOptions } from '@entities/Log';
import { getProxiesOptions, getProxyProvidersOptions } from '@entities/Proxy';
import { ROUTE_NS, type RuleEditorSearch } from '@entities/Route';
import { parseRuleSearch } from '@entities/Rule';
import { getRuleSetCatalogOptions, parseRuleSetSearch, RULE_SET_NS } from '@entities/RuleSet';
import { AUTH_PASSWORD_NS } from '@features/Auth/AuthPassword';
import { CONFIG_CACHE_FILE_NS } from '@features/Config/ConfigCacheFile';
import { CONFIG_DNS_EDIT_NS } from '@features/Config/ConfigDnsEdit';
import { CONFIG_NODE_ADD_NS } from '@features/Config/ConfigNodeAdd';
import { CONFIG_NODE_DELETE_NS } from '@features/Config/ConfigNodeDelete';
import { CONFIG_NODE_FORM_NS } from '@features/Config/ConfigNodeForm';
import { CONNECTION_CLOSE_NS } from '@features/Connection/ConnectionClose';
import { DAEMON_CONTROL_NS } from '@features/Daemon/DaemonControl';
import { DEVICE_RENAME_NS } from '@features/Device/DeviceRename';
import { DEVICE_ROUTE_NS } from '@features/Device/DeviceRoute';
import { LOG_CLEAR_NS } from '@features/Log/LogClear';
import { MCP_ACCESS_NS } from '@features/Mcp/McpAccess';
import { PROXY_PROVIDER_UPDATE_NS } from '@features/Proxy/ProxyProviderUpdate';
import { PROXY_REALITY_RECOVERY_NS } from '@features/Proxy/ProxyRealityRecovery';
import { RULE_ADD_NS } from '@features/Rule/RuleAdd';
import { RULE_CATALOG_ADD_NS } from '@features/Rule/RuleCatalogAdd';
import { RULE_CUSTOM_ADD_NS } from '@features/Rule/RuleCustomAdd';
import { RULE_DELETE_NS } from '@features/Rule/RuleDelete';
import { RULE_EDIT_NS } from '@features/Rule/RuleEdit';
import { RULE_RAW_NS } from '@features/Rule/RuleRaw';
import { RULE_REORDER_NS } from '@features/Rule/RuleReorder';
import { RULE_SET_CUSTOM_NS } from '@features/RuleSet/RuleSetCustom';
import { RULE_SET_DELETE_NS } from '@features/RuleSet/RuleSetDelete';
import { RULE_SET_REMOTE_FORM_NS } from '@features/RuleSet/RuleSetRemoteForm';
import { CONNECTIONS_NS, CONNECTIONS_PATH, loadConnectionsPage } from '@pages/Connections';
import { DEVICES_NS, DEVICES_PATH, loadDevicesPage } from '@pages/Devices';
import { DIAGNOSTICS_NS, DIAGNOSTICS_PATH, loadDiagnosticsPage } from '@pages/Diagnostics';
import { EDITOR_NS, EDITOR_PATH, loadEditorPage } from '@pages/Editor';
import { HOW_IT_WORKS_NS, HOW_IT_WORKS_PATH, loadHowItWorksPage } from '@pages/HowItWorks';
import { LOGS_NS, LOGS_PATH, loadLogsPage } from '@pages/Logs';
import { OVERVIEW_NS, OVERVIEW_PATH, loadOverviewPage } from '@pages/Overview';
import { PROXIES_NS, PROXIES_PATH, loadProxiesPage } from '@pages/Proxies';
import { RAW_CONFIG_NS, RAW_CONFIG_PATH, loadRawConfigPage } from '@pages/RawConfig';
import { RULE_SETS_NS, RULE_SETS_PATH, loadRuleSetsPage } from '@pages/RuleSets';
import { SECTION_NS, SECTION_PATH, loadSectionPage } from '@pages/Section';
import { SETTINGS_NS, SETTINGS_PATH, loadSettingsPage } from '@pages/Settings';
import { SIMPLE_ROUTES_NS, SIMPLE_ROUTES_PATH, loadSimpleRoutesPage } from '@pages/SimpleRoutes';
import { QueryClientInstance } from '@shared/api';
import { CONFIG_BUILD_NOTICE_NS } from '@widgets/Config/ConfigBuildNotice';
import { CONFIG_NODE_NS } from '@widgets/Config/ConfigNode';
import { CONFIG_RAW_EDITOR_NS } from '@widgets/Config/ConfigRawEditor';
import { CONFIG_SECTION_SETTINGS_NS } from '@widgets/Config/ConfigSectionSettings';
import { CONFIG_TABS_NS } from '@widgets/Config/ConfigTabs';
import { CONNECTION_SUMMARY_NS } from '@widgets/ConnectionSummary';
import { CONNECTION_TABLE_NS } from '@widgets/ConnectionTable';
import { DAEMON_SERVICE_NS } from '@widgets/Daemon/DaemonService';
import { DAEMON_TRAFFIC_NS } from '@widgets/Daemon/DaemonTraffic';
import { PROXY_GROUPS_NS } from '@widgets/ProxyGroups';
import { PROXY_LATENCY_NS } from '@widgets/ProxyLatency';
import { ROUTE_EXPLANATION_NS } from '@widgets/RouteExplanation';
import { RULE_PANEL_NS } from '@widgets/Rule/RulePanel';
import { RULE_TABLE_NS } from '@widgets/Rule/RuleTable';
import { RULE_SET_TABLE_NS, type RuleSetLinks } from '@widgets/RuleSet/RuleSetTable';

import { preloadNamespaces } from '../lib/i18n';
import { AppLayout } from '../ui/AppLayout';
import { ConfigLayout } from '../ui/ConfigLayout';
import { ErrorPage } from '../ui/ErrorPage';
import { NotFoundPage } from '../ui/NotFoundPage';
import { PendingPage } from '../ui/PendingPage';
import { bindPage } from './Router.bindPage';
import { ROOT_PATH, CONFIG_LAYOUT_PATH } from './Router.paths';
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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_PATH,
  beforeLoad: () => {
    throw redirect({ to: OVERVIEW_PATH });
  },
});

/**
 * Configuration section: a shell with a header and a tab strip, with the tab
 * under it. Tabs are child routes, so switching between them changes one tree
 * node instead of rebuilding the whole section.
 */
export const configLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([CONFIG_TABS_NS, CONFIG_BUILD_NOTICE_NS]),
      QueryClientInstance.query(getConfigOptions()).catch(keepFailureForScreen),
    ]),
  path: CONFIG_LAYOUT_PATH,
  component: ConfigLayout,
});

export const routeEditorRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () =>
    preloadNamespaces([
      EDITOR_NS,
      RULE_TABLE_NS,
      RULE_PANEL_NS,
      RULE_EDIT_NS,
      RULE_RAW_NS,
      RULE_ADD_NS,
      RULE_REORDER_NS,
      RULE_DELETE_NS,
      CONFIG_SECTION_SETTINGS_NS,
      CONFIG_NODE_FORM_NS,
    ]),
  path: EDITOR_PATH,
  validateSearch: parseRuleSearch,
  component: lazyRouteComponent(loadEditorPage, 'EditorPage'),
});

export const simpleRoutesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([
        SIMPLE_ROUTES_NS,
        CONFIG_DNS_EDIT_NS,
        CONFIG_NODE_ADD_NS,
        CONFIG_CACHE_FILE_NS,
        RULE_CATALOG_ADD_NS,
        RULE_CUSTOM_ADD_NS,
        RULE_REORDER_NS,
        RULE_SET_NS,
      ]),
      QueryClientInstance.query(getDataplaneOptions()).catch(keepFailureForScreen),
    ]),
  path: SIMPLE_ROUTES_PATH,
  validateSearch: (search: Record<string, unknown>): { outbound?: string } => ({
    outbound: typeof search.outbound === 'string' && search.outbound !== '' ? search.outbound : undefined,
  }),
});

export const ruleSetsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([
        RULE_SETS_NS,
        RULE_SET_TABLE_NS,
        RULE_SET_NS,
        RULE_SET_REMOTE_FORM_NS,
        RULE_SET_CUSTOM_NS,
        RULE_SET_DELETE_NS,
        CONFIG_CACHE_FILE_NS,
        CONFIG_NODE_FORM_NS,
      ]),
      QueryClientInstance.query(getRuleSetCatalogOptions()).catch(keepFailureForScreen),
    ]),
  path: RULE_SETS_PATH,
  validateSearch: parseRuleSetSearch,
});

export const rawConfigRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  loader: async () => preloadNamespaces([RAW_CONFIG_NS, CONFIG_RAW_EDITOR_NS]),
  path: RAW_CONFIG_PATH,
  component: lazyRouteComponent(loadRawConfigPage, 'RawConfigPage'),
});

/**
 * Sections without their own screen share one screen with a parameter: their
 * nodes open as a schema form and as text. Static child paths match before the parameter, and a foreign section name is a plain 404.
 */
export const configSectionRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: SECTION_PATH,
  validateSearch: parseSectionSearch,
  beforeLoad: ({ params }) => {
    if (!isGenericSection(params.section)) {
      throw notFound();
    }
  },
  loader: async () =>
    preloadNamespaces([
      SECTION_NS,
      CONFIG_NODE_NS,
      CONFIG_SECTION_SETTINGS_NS,
      CONFIG_NODE_FORM_NS,
      CONFIG_NODE_ADD_NS,
      CONFIG_NODE_DELETE_NS,
    ]),
});

export const howItWorksRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([HOW_IT_WORKS_NS, ROUTE_NS]),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getProxyProvidersOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getDevicesOptions()).catch(keepFailureForScreen),
    ]),
  path: HOW_IT_WORKS_PATH,
});

export const proxiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([PROXIES_NS, PROXY_GROUPS_NS, PROXY_PROVIDER_UPDATE_NS, PROXY_REALITY_RECOVERY_NS]),
      QueryClientInstance.query(getConfigOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getProxyProvidersOptions()).catch(keepFailureForScreen),
    ]),
  path: PROXIES_PATH,
  component: lazyRouteComponent(loadProxiesPage, 'ProxiesPage'),
});

export const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    preloadNamespaces([CONNECTIONS_NS, CONNECTION_TABLE_NS, ROUTE_NS, ROUTE_EXPLANATION_NS, CONNECTION_CLOSE_NS]),
  path: CONNECTIONS_PATH,
  validateSearch: parseConnectionSearch,
});

export const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([DEVICES_NS, DEVICE_RENAME_NS, DEVICE_ROUTE_NS]),
      QueryClientInstance.query(getDevicesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getDataplaneOptions()).catch(keepFailureForScreen),
    ]),
  path: DEVICES_PATH,
});

export const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([LOGS_NS, LOG_CLEAR_NS]),
      QueryClientInstance.query(getLogTailOptions(DEFAULT_LOG_LEVEL)).catch(keepFailureForScreen),
    ]),
  path: LOGS_PATH,
  component: lazyRouteComponent(loadLogsPage, 'LogsPage'),
});

/** The report is not loaded in advance: a run sends packets and starts only on the button. Nodes for selection come from the proxy. */
export const diagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([DIAGNOSTICS_NS]),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
    ]),
  path: DIAGNOSTICS_PATH,
  component: lazyRouteComponent(loadDiagnosticsPage, 'DiagnosticsPage'),
});

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    Promise.all([
      preloadNamespaces([
        OVERVIEW_NS,
        ROUTE_NS,
        CONNECTION_SUMMARY_NS,
        DAEMON_SERVICE_NS,
        DAEMON_TRAFFIC_NS,
        DAEMON_CONTROL_NS,
        PROXY_LATENCY_NS,
      ]),
      QueryClientInstance.query(getProxiesOptions()).catch(keepFailureForScreen),
      QueryClientInstance.query(getTrafficHistoryOptions()).catch(keepFailureForScreen),
    ]),
  path: OVERVIEW_PATH,
});

/** Rare settings of the panel itself. The state is read by the sections, nothing is preloaded but texts. */
export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  loader: async () =>
    preloadNamespaces([SETTINGS_NS, AUTH_PASSWORD_NS, MCP_ACCESS_NS, DAEMON_SERVICE_NS, DAEMON_CONTROL_NS]),
  path: SETTINGS_PATH,
});

const ruleSetLinks: RuleSetLinks = {
  reference: (usage) =>
    usage.kind === 'route'
      ? linkOptions({ to: routeEditorRoute.to, search: { rule: usage.number } })
      : linkOptions({
          to: configSectionRoute.to,
          params: { section: CONFIG_SECTION.DnsRules },
          search: { node: usage.number },
        }),
  byTag: (tag) => linkOptions({ to: routeEditorRoute.to, search: { rule_set: tag } }),
};

// Bind components after their route declarations so their typed links can refer to the complete tree.
simpleRoutesRoute.update({
  component: bindPage(lazyRouteComponent(loadSimpleRoutesPage, 'SimpleRoutesPage'), function useSimpleRoutesProps() {
    const { outbound } = simpleRoutesRoute.useSearch();
    const navigate = simpleRoutesRoute.useNavigate();
    return {
      outbound,
      onOutboundChange: (value: string | undefined) => {
        void navigate({ search: { outbound: value }, resetScroll: false });
      },
      referenceLink: ruleSetLinks.reference,
      links: {
        self: simpleRoutesRoute.to,
        help: howItWorksRoute.to,
        proxies: proxiesRoute.to,
        providers: linkOptions({ to: configSectionRoute.to, params: { section: CONFIG_SECTION.Providers } }),
        rule: (rule: number) => linkOptions({ to: routeEditorRoute.to, search: { rule } }),
      },
    };
  }),
});

ruleSetsRoute.update({
  component: bindPage(lazyRouteComponent(loadRuleSetsPage, 'RuleSetsPage'), function useRuleSetsProps() {
    return { openedTag: ruleSetsRoute.useSearch().set, ruleSetLinks };
  }),
});

configSectionRoute.update({
  component: bindPage(lazyRouteComponent(loadSectionPage, 'SectionPage'), function useSectionProps() {
    return { section: configSectionRoute.useParams().section, node: configSectionRoute.useSearch().node };
  }),
});

howItWorksRoute.update({
  component: bindPage(lazyRouteComponent(loadHowItWorksPage, 'HowItWorksPage'), () => ({
    links: {
      overview: overviewRoute.to,
      devices: devicesRoute.to,
      proxies: proxiesRoute.to,
      settings: settingsRoute.to,
      ruleSet: (set?: string) => linkOptions({ to: ruleSetsRoute.to, search: { set } }),
      rule: (search: RuleEditorSearch) => linkOptions({ to: routeEditorRoute.to, search }),
      section: (section: GenericSection) => linkOptions({ to: configSectionRoute.to, params: { section } }),
    },
  })),
});

connectionsRoute.update({
  component: bindPage(lazyRouteComponent(loadConnectionsPage, 'ConnectionsPage'), () => ({
    editorTo: routeEditorRoute.to,
  })),
});

devicesRoute.update({
  component: bindPage(lazyRouteComponent(loadDevicesPage, 'DevicesPage'), () => ({
    connectionLink: (source: string) => linkOptions({ to: connectionsRoute.to, search: { source } }),
  })),
});

overviewRoute.update({
  component: bindPage(lazyRouteComponent(loadOverviewPage, 'OverviewPage'), () => ({
    links: {
      proxies: proxiesRoute.to,
      connections: connectionsRoute.to,
      logs: logsRoute.to,
      diagnostics: diagnosticsRoute.to,
    },
  })),
});

settingsRoute.update({
  component: bindPage(lazyRouteComponent(loadSettingsPage, 'SettingsPage'), () => ({ devicesTo: devicesRoute.to })),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  howItWorksRoute,
  configLayoutRoute.addChildren([
    routeEditorRoute,
    simpleRoutesRoute,
    ruleSetsRoute,
    rawConfigRoute,
    configSectionRoute,
  ]),
  proxiesRoute,
  connectionsRoute,
  devicesRoute,
  logsRoute,
  diagnosticsRoute,
  overviewRoute,
  settingsRoute,
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
