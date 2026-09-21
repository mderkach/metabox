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
 * Текущий пункт меню по адресу: точное совпадение, иначе самый длинный
 * префикс. Вкладки раздела конфигурации живут на своих адресах, и без
 * префикса пункт «Конфигурация» гас бы на каждой из них, кроме первой.
 */
export function pickActiveNav(pathname: string, targets: readonly string[]): string | null {
  let active: string | null = null;

  for (const target of targets) {
    const matches = pathname === target || pathname.startsWith(`${target}/`);

    if (matches && (active === null || target.length > active.length)) {
      active = target;
    }
  }

  return active;
}

/**
 * Состояние боковой панели. Выбор переживает перезагрузку страницы, но на узком
 * экране не действует: там панель всегда свёрнута до полосы значков.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const narrow = useNarrowScreen();

  // Хранилище пишется снаружи обновления состояния: React зовёт обновляющую
  // функцию дважды в строгом режиме, и запись ушла бы в неё вместе с остальным.
  const toggle = useCallback(() => {
    const next = !collapsed;

    writeCollapsed(next);
    setCollapsed(next);
  }, [collapsed]);

  return { collapsed: collapsed || narrow, narrow, toggle };
}
