import type { LinkProps } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import { Activity, Gauge, Share2, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  key: ParseKeys<'shared'>;
  icon: LucideIcon;
  /** Маршрут есть только у сделанных разделов: остальные пункты не кликаются. */
  to?: LinkProps['to'];
  /** Подпись в нижней панели, если полное название не помещается в её колонку на телефоне. */
  short?: ParseKeys<'widgets/AppSidebar'>;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'section.overview', icon: Gauge, to: '/overview' },
  { key: 'section.config', icon: SlidersHorizontal, to: '/config', short: 'short.config' },
  { key: 'section.proxies', icon: Share2, to: '/proxies' },
  { key: 'section.connections', icon: Activity, to: '/connections' },
];

/** Адреса разделов в порядке меню: по нему роутер выбирает направление перехода. */
export const NAV_TARGETS: readonly string[] = NAV_ITEMS.flatMap((item) => (item.to === undefined ? [] : [item.to]));
