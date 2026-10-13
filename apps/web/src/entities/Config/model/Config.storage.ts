import { z } from 'zod';

const STORAGE_KEY = 'metabox.config.draft';

/**
 * Draft in the browser. `base` is the config text itself the draft was made
 * from, not its hash: `crypto.subtle` exists only in a secure context, while
 * the panel is opened at the router's `http://` address. A config weighs tens
 * of kilobytes and the storage quota is megabytes.
 *
 * The record outlives panel versions, so it is read with a schema: a foreign
 * shape means "no draft", not a crash at startup.
 */
const StoredDraftSchema = z.object({
  base: z.string().nullable(),
  draft: z.string().nullable(),
  lists: z.record(z.string(), z.string().nullable()),
});

export type StoredDraft = z.infer<typeof StoredDraftSchema>;

const NO_DRAFT: StoredDraft = { base: null, draft: null, lists: {} };

/** In a private window, access to the storage throws. */
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

/** Without edits the record is deleted: an empty draft is not needed on the next open. */
export function writeStoredDraft(stored: StoredDraft): void {
  try {
    if (stored.draft === null && Object.keys(stored.lists).length === 0) {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
  } catch (error) {
    console.warn('[DRAFT] draft was not saved in the browser', error);
  }
}
