import { useCallback, useState } from 'react';
import { z } from 'zod';

import { matchNarrow } from '@shared/lib/media';

const STORAGE_KEY = 'metabox.rawEditor.wrap';

/** Хранилище отдаёт строку, и она может быть чем угодно: ключ переживает версии панели. */
const StoredWrapSchema = z.enum(['true', 'false']);

/**
 * Без сохранённого выбора перенос включён на узком экране: колонка там около
 * 240px, и строка без переноса обрезается посреди значения.
 * В приватном окне обращение к хранилищу бросает.
 */
function readWrap(): boolean {
  try {
    const stored = StoredWrapSchema.safeParse(globalThis.localStorage.getItem(STORAGE_KEY));

    if (stored.success) {
      return stored.data === 'true';
    }
  } catch {
    // Хранилище недоступно — решает ширина экрана.
  }

  return matchNarrow();
}

function writeWrap(wrap: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(wrap));
  } catch {
    // Не сохранилось — при следующем открытии решит ширина экрана.
  }
}

/** Перенос строк в текстовом редакторе. Выбор личный и переживает перезагрузку страницы. */
export function useRawEditorWrap() {
  const [wrap, setWrap] = useState(readWrap);

  // Хранилище пишется снаружи обновления состояния: React зовёт обновляющую
  // функцию дважды в строгом режиме.
  const toggle = useCallback(() => {
    const next = !wrap;

    writeWrap(next);
    setWrap(next);
  }, [wrap]);

  return { wrap, toggle };
}
