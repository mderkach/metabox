import { useEffect, useState } from 'react';

/**
 * Ширина, ниже которой раскладка перестаёт быть настольной: сайдбар свёрнут до
 * полосы значков, а таблица разворачивается в список «подпись — значение».
 */
export const NARROW_SCREEN = '(max-width: 48rem)';

/** В jsdom `matchMedia` нет вовсе, поэтому наличие функции проверяется. */
export function matchNarrow(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(NARROW_SCREEN).matches;
}

/**
 * Узкий экран следится подпиской, а не одним замером на старте: иначе поворот
 * телефона оставлял бы раскладку, рассчитанную на прежнюю ширину.
 */
export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(matchNarrow);

  useEffect(function watchWidth() {
    if (typeof globalThis.matchMedia !== 'function') {
      return;
    }

    const query = globalThis.matchMedia(NARROW_SCREEN);

    function syncNarrow(event: MediaQueryListEvent) {
      setNarrow(event.matches);
    }

    query.addEventListener('change', syncNarrow);

    return function stopWatchingWidth() {
      query.removeEventListener('change', syncNarrow);
    };
  }, []);

  return narrow;
}
