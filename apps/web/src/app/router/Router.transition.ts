import type { ParsedLocation } from '@tanstack/react-router';

import { NAV_TARGETS, pickActiveNav } from '@widgets/AppSidebar';

/**
 * Transition types between screens. They are read by
 * `:active-view-transition-type()` in `app/styles/index.css`, which also holds
 * the animation itself.
 */
export const PAGE_TRANSITION = {
  Forward: 'page-forward',
  Backward: 'page-backward',
  Fade: 'page-fade',
  /** Transition within a section: the content changes, the shell stays. */
  Hold: 'page-hold',
} as const;

export type PageTransition = (typeof PAGE_TRANSITION)[keyof typeof PAGE_TRANSITION];

interface LocationChange {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
  pathChanged: boolean;
}

/**
 * A URL section is its first segment: the tabs of a section share it, and they
 * also share the shell held by the layout route.
 *
 * Equal segments mean a shared shell while the panel has a single layout. A
 * nested route without a layout, for example a separate connection screen, gets
 * the same type, and its header will change by a cut instead of dissolving.
 */
function toSection(pathname: string): string {
  return pathname.split('/')[1] ?? '';
}

function toNavIndex(pathname: string): number {
  const target = pickActiveNav(pathname, NAV_TARGETS);

  return target === null ? -1 : NAV_TARGETS.indexOf(target);
}

/**
 * The screen leaves in the direction the current menu item moved. Paths outside
 * the menu change by dissolving. The first visit and a change of only the URL
 * parameters get no transition: there is nothing to animate.
 *
 * A transition within a section gets no direction for a different reason: the
 * layout route holds the shell there and it stays, while shifting the content
 * under a motionless header reads as a jerk, not a transition. The direction is
 * shown instead by the underline moving under the new tab. The cost of this
 * decision: "Configuration" and "Rule set catalog" are two adjacent menu items,
 * and the sidebar highlight between them still jumps although the content only
 * dissolves.
 */
export function toPageTransitionTypes({
  fromLocation,
  toLocation,
  pathChanged,
}: LocationChange): PageTransition[] | false {
  if (fromLocation === undefined || !pathChanged) return false;

  if (toSection(fromLocation.pathname) === toSection(toLocation.pathname)) return [PAGE_TRANSITION.Hold];

  const from = toNavIndex(fromLocation.pathname);
  const to = toNavIndex(toLocation.pathname);
  if (from < 0 || to < 0 || from === to) return [PAGE_TRANSITION.Fade];

  return [from < to ? PAGE_TRANSITION.Forward : PAGE_TRANSITION.Backward];
}
