import type { ParsedLocation } from '@tanstack/react-router';

import { NAV_TARGETS, pickActiveNav } from '@widgets/AppSidebar';

/**
 * Типы перехода между экранами. Их читает `:active-view-transition-type()` в
 * `app/styles/index.css`, и там же лежит сама анимация.
 */
export const PAGE_TRANSITION = {
  Forward: 'page-forward',
  Backward: 'page-backward',
  Fade: 'page-fade',
} as const;

export type PageTransition = (typeof PAGE_TRANSITION)[keyof typeof PAGE_TRANSITION];

interface LocationChange {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
  pathChanged: boolean;
}

function toNavIndex(pathname: string): number {
  const target = pickActiveNav(pathname, NAV_TARGETS);

  return target === null ? -1 : NAV_TARGETS.indexOf(target);
}

/**
 * Экран уходит в ту сторону, куда сместился текущий пункт меню; адреса одного
 * пункта и пути вне меню сменяются растворением. Первый заход и смена одних
 * параметров адреса перехода не получают: анимировать там нечего.
 */
export function toPageTransitionTypes({
  fromLocation,
  toLocation,
  pathChanged,
}: LocationChange): PageTransition[] | false {
  if (fromLocation === undefined || !pathChanged) return false;

  const from = toNavIndex(fromLocation.pathname);
  const to = toNavIndex(toLocation.pathname);
  if (from < 0 || to < 0 || from === to) return [PAGE_TRANSITION.Fade];

  return [from < to ? PAGE_TRANSITION.Forward : PAGE_TRANSITION.Backward];
}
