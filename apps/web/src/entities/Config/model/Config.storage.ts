import { z } from 'zod';

const STORAGE_KEY = 'metabox.config.draft';

/**
 * Черновик в браузере. `base` — сам текст конфига, от которого сделан
 * черновик, а не его хэш: `crypto.subtle` есть только в защищённом контексте,
 * а панель открывают по `http://` адресу роутера. Конфиг весит десятки
 * килобайт, квота хранилища — мегабайты.
 *
 * Запись переживает версии панели, поэтому читается схемой: чужая форма
 * означает «черновика нет», а не падение на старте.
 */
const StoredDraftSchema = z.object({
  base: z.string().nullable(),
  draft: z.string().nullable(),
  lists: z.record(z.string(), z.string().nullable()),
});

export type StoredDraft = z.infer<typeof StoredDraftSchema>;

const NO_DRAFT: StoredDraft = { base: null, draft: null, lists: {} };

/** В приватном окне обращение к хранилищу бросает. */
export function readStoredDraft(): StoredDraft {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);

    if (raw === null) return NO_DRAFT;

    const stored = StoredDraftSchema.safeParse(JSON.parse(raw));

    return stored.success ? stored.data : NO_DRAFT;
  } catch {
    return NO_DRAFT;
  }
}

/** Без правок запись удаляется: пустой черновик при следующем открытии не нужен. */
export function writeStoredDraft(stored: StoredDraft): void {
  try {
    if (stored.draft === null && Object.keys(stored.lists).length === 0) {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
  } catch (error) {
    console.warn('[DRAFT] черновик не сохранён в браузере', error);
  }
}
