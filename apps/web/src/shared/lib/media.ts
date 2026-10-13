import { useEffect, useState } from 'react';

/**
 * Width below which the layout stops being desktop: the sidebar yields its
 * place to the bottom bar, the overview becomes the start screen, and the table
 * unfolds into a "label — value" list.
 */
export const NARROW_SCREEN = '(max-width: 48rem)';

/**
 * Width below which the side panel has no room beside the list: there it
 * opens as a sheet on top of it. Matches Tailwind's `lg`, at which the
 * screen layout switches from a row to a column.
 */
export const PANEL_AS_SHEET = '(width < 64rem)';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** jsdom has no `matchMedia` at all, so the presence of the function is checked. */
function matchQuery(query: string): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(query).matches;
}

export function matchNarrow(): boolean {
  return matchQuery(NARROW_SCREEN);
}

/**
 * The media query is followed by a subscription, not by a single measurement at start: otherwise phone
 * rotation or a system setting change would leave the old answer.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchQuery(query));

  useEffect(
    function watchQuery() {
      if (typeof globalThis.matchMedia !== 'function') {
        return;
      }

      const list = globalThis.matchMedia(query);

      function syncQuery(event: MediaQueryListEvent) {
        setMatches(event.matches);
      }

      list.addEventListener('change', syncQuery);

      return function stopWatchingQuery() {
        list.removeEventListener('change', syncQuery);
      };
    },
    [query]
  );

  return matches;
}

export function useNarrowScreen(): boolean {
  return useMediaQuery(NARROW_SCREEN);
}

export function usePanelAsSheet(): boolean {
  return useMediaQuery(PANEL_AS_SHEET);
}

export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}
