import { useEffect, useState } from 'react';

/**
 * Ширина, ниже которой раскладка перестаёт быть настольной: сайдбар свёрнут до
 * полосы значков, а таблица разворачивается в список «подпись — значение».
 */
export const NARROW_SCREEN = '(max-width: 48rem)';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** В jsdom `matchMedia` нет вовсе, поэтому наличие функции проверяется. */
function matchQuery(query: string): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(query).matches;
}

export function matchNarrow(): boolean {
  return matchQuery(NARROW_SCREEN);
}

/**
 * Медиазапрос следится подпиской, а не одним замером на старте: иначе поворот
 * телефона или смена системной настройки оставляли бы прежний ответ.
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

export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}
