import type { LinkProps } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import { Activity, Gauge, MonitorSmartphone, ScrollText, Share2, SlidersHorizontal, Stethoscope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  key: ParseKeys<'shared'>;
  icon: LucideIcon;
  /** A route exists only for finished sections: other items are not clickable. */
  to?: LinkProps['to'];
  /** Label in the bottom bar if the full name does not fit in its column on a phone. */
  short?: ParseKeys<'widgets/AppSidebar'>;
  /**
   * On a phone the item goes to the "More" sheet: the bottom bar columns are enough for
   * five sections and the "More" item itself, and service screens are
   * rarely opened from a phone.
   */
  more?: true;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'section.overview', icon: Gauge, to: '/overview' },
  { key: 'section.config', icon: SlidersHorizontal, to: '/config', short: 'short.config' },
  { key: 'section.proxies', icon: Share2, to: '/proxies' },
  { key: 'section.connections', icon: Activity, to: '/connections', short: 'short.connections' },
  { key: 'section.devices', icon: MonitorSmartphone, to: '/devices', short: 'short.devices' },
  { key: 'section.logs', icon: ScrollText, to: '/logs', more: true },
  { key: 'section.diagnostics', icon: Stethoscope, to: '/diagnostics', more: true },
];

/** Section addresses in menu order: the router picks the transition direction by it. */
export const NAV_TARGETS: readonly string[] = NAV_ITEMS.flatMap((item) => (item.to === undefined ? [] : [item.to]));
