import type { ParseKeys } from 'i18next';
import {
  Activity,
  BookOpen,
  Gauge,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Share2,
  SlidersHorizontal,
  Stethoscope,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { SHARED_NS } from '@shared/i18n';
import type { StaticPagePath } from '@shared/lib/navigation';

interface NavItem {
  key: ParseKeys<typeof SHARED_NS>;
  icon: LucideIcon;
  /** A route exists only for finished sections: other items are not clickable. */
  to?: StaticPagePath;
  /** Path prefix shared by every screen in this section. */
  match?: string;
  /**
   * On a phone the item goes to the "More" sheet: the bottom bar columns are enough for
   * five sections and the "More" item itself, and service screens are
   * rarely opened from a phone.
   */
  more?: true;
}

export function createSidebarNavigation(routes: {
  overview: StaticPagePath;
  config: StaticPagePath;
  simple: StaticPagePath;
  proxies: StaticPagePath;
  connections: StaticPagePath;
  devices: StaticPagePath;
  logs: StaticPagePath;
  diagnostics: StaticPagePath;
  settings: StaticPagePath;
  help: StaticPagePath;
}) {
  const help = { key: 'section.howItWorks', icon: BookOpen, to: routes.help, more: true } as const satisfies NavItem;
  const sections: readonly NavItem[] = [
    { key: 'section.overview', icon: Gauge, to: routes.overview },
    { key: 'section.config', icon: SlidersHorizontal, to: routes.simple, match: routes.config },
    { key: 'section.proxies', icon: Share2, to: routes.proxies },
    { key: 'section.connections', icon: Activity, to: routes.connections },
    { key: 'section.devices', icon: MonitorSmartphone, to: routes.devices },
    { key: 'section.logs', icon: ScrollText, to: routes.logs, more: true },
    { key: 'section.diagnostics', icon: Stethoscope, to: routes.diagnostics, more: true },
    { key: 'section.settings', icon: Settings, to: routes.settings, more: true },
  ];
  const items: readonly NavItem[] = [help, ...sections];
  const targets = [...sections, help].flatMap((item: NavItem) =>
    item.to === undefined ? [] : [item.match ?? item.to]
  );

  return { help, sections, items, targets };
}

export type SidebarNavigation = ReturnType<typeof createSidebarNavigation>;
