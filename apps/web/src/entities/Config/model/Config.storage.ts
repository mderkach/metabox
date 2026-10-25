import { z } from 'zod';

import { fingerprint } from '@shared/lib/fingerprint';

const STORAGE_KEY = 'metabox.config.draft';

/**
 * Draft in the browser. `base` is the `fingerprint` of the config text the
 * draft was made from, not the text: the record only has to tell that the
 * config on the device moved, and a second copy of the config with its node
 * secrets has no place in the storage.
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

const FINGERPRINT_VERSION = 2;

const VersionedDraftSchema = StoredDraftSchema.extend({ version: z.literal(FINGERPRINT_VERSION) });

/** A record without a version holds the config text as `base`. */
const TextBaseDraftSchema = StoredDraftSchema.extend({ version: z.never().optional() });

const NO_DRAFT: StoredDraft = { base: null, draft: null, lists: {} };

/**
 * In a private window, access to the storage throws.
 *
 * A record with the config text as `base` is rewritten at once with its
 * fingerprint: the text leaves the storage, the draft is kept.
 */
export function readStoredDraft(): StoredDraft {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);

    if (raw === null) return NO_DRAFT;

    const parsed: unknown = JSON.parse(raw);
    const stored = VersionedDraftSchema.safeParse(parsed);

    if (stored.success) return stored.data;

    const textBase = TextBaseDraftSchema.safeParse(parsed);

    if (!textBase.success) return NO_DRAFT;

    const { base } = textBase.data;
    const migrated: StoredDraft = { ...textBase.data, base: base === null ? null : fingerprint(base) };

    writeStoredDraft(migrated);

    return migrated;
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
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, version: FINGERPRINT_VERSION }));
    }
  } catch (error) {
    console.warn('[DRAFT] draft was not saved in the browser', error);
  }
}
