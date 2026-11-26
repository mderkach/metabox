import { createSidebarNavigation } from '@widgets/AppSidebar';

import {
  overviewRoute,
  configLayoutRoute,
  simpleRoutesRoute,
  proxiesRoute,
  connectionsRoute,
  devicesRoute,
  logsRoute,
  diagnosticsRoute,
  settingsRoute,
  howItWorksRoute,
} from './Router';

export function getSidebarNavigation() {
  return createSidebarNavigation({
    overview: overviewRoute.to,
    config: configLayoutRoute.to,
    simple: simpleRoutesRoute.to,
    proxies: proxiesRoute.to,
    connections: connectionsRoute.to,
    devices: devicesRoute.to,
    logs: logsRoute.to,
    diagnostics: diagnosticsRoute.to,
    settings: settingsRoute.to,
    help: howItWorksRoute.to,
  });
}
