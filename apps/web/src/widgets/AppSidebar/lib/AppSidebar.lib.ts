import { useCallback, useState } from 'react';
import { z } from 'zod';

const STORAGE_KEY = 'metabox.sidebar.collapsed';

/** Хранилище отдаёт строку, и она может быть чем угодно: ключ переживает версии панели. */
const StoredCollapsedSchema = z.enum(['true', 'false']);

/** Ширина, ниже которой развёрнутая панель съедает половину экрана. */
const NARROW_SCREEN = '(max-width: 48rem)';

/**
 * Выбора не было — решает ширина экрана. В jsdom `matchMedia` нет вовсе,
 * поэтому наличие функции проверяется, а не предполагается.
 */
function prefersCollapsed(): boolean {
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

  return prefersCollapsed();
}

function writeCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Не сохранилось — панель вернётся к развёрнутому виду.
  }
}

/** Выбор переживает перезагрузку страницы. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current);

      return !current;
    });
  }, []);

  return { collapsed, toggle };
}
