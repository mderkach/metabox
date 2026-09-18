import { useCallback, useState } from 'react';
import { z } from 'zod';

import { matchNarrow, useNarrowScreen } from '@shared/lib/media';

const STORAGE_KEY = 'metabox.sidebar.collapsed';

/** Хранилище отдаёт строку, и она может быть чем угодно: ключ переживает версии панели. */
const StoredCollapsedSchema = z.enum(['true', 'false']);

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
