import type { OverviewLinks } from '../model/Overview.links';
import { OverviewPage } from '../ui/OverviewPage';

const LINKS: OverviewLinks = {
  logs: '/logs',
  diagnostics: '/diagnostics',
  proxies: '/proxies',
  connections: '/connections',
};

export function OverviewScreen() {
  return <OverviewPage links={LINKS} />;
}
