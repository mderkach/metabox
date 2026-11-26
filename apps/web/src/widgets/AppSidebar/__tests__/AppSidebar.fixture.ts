import { createSidebarNavigation } from '../model';

export const navigation = createSidebarNavigation({
  overview: '/overview',
  config: '/config',
  simple: '/config/simple',
  proxies: '/proxies',
  connections: '/connections',
  devices: '/devices',
  logs: '/logs',
  diagnostics: '/diagnostics',
  settings: '/settings',
  help: '/how-it-works',
});
