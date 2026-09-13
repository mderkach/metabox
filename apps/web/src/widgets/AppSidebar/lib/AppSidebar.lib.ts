import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

const STORAGE_KEY = 'metabox.sidebar.collapsed';

/** Хранилище отдаёт строку, и она может быть чем угодно: ключ переживает версии панели. */
const StoredCollapsedSchema = z.enum(['true', 'false']);

/** Ширина, ниже которой развёрнутая панель съедает половину экрана. */
const NARROW_SCREEN = '(max-width: 48rem)';

/** В jsdom `matchMedia` нет вовсе, поэтому наличие функции проверяется. */
function matchNarrow(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(NARROW_SCREEN).matches;
}

/** В приватном окне обращение к хранилищу бросает. */
function readCollapsed(): boolean {
  try {
    const stored = StoredCollapsedSchema.safeParse(globalThis.localStorage.getItem(STORAGE_KEY));

    if (stored.success) {
      return stored.data === 'true';
    }
  } catch {
    // Хранилище недоступно — остаётся ширина экрана.
  }

  return matchNarrow();
}

function writeCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Не сохранилось — панель вернётся к развёрнутому виду.
  }
}

/**
 * Узкий экран следится подпиской, а не одним замером на старте: сохранённый
 * выбор «развёрнуто» иначе переживал бы поворот телефона и оставлял под
 * содержимое полторы сотни пикселей.
 */
function useNarrowScreen(): boolean {
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

/**
 * Состояние боковой панели. Выбор переживает перезагрузку страницы, но на узком
 * экране не действует: там панель всегда свёрнута до полосы значков.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const narrow = useNarrowScreen();

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current);

      return !current;
    });
  }, []);

  return { collapsed: collapsed || narrow, narrow, toggle };
}
