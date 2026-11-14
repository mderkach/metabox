import { z } from 'zod';

import type { ProvidersSeen } from './Proxy.nodeDrop';

const STORAGE_KEY = 'metabox.proxy.providers';

/**
 * The core updates subscriptions on its own schedule, usually while the panel
 * is closed, so the counts seen last time are kept in the browser: a shrunk set
 * is noticed on the next look, not only right after a manual update.
 *
 * The record outlives panel versions and is read with a schema: a foreign
 * shape means "nothing seen yet".
 */
const StoredSeenSchema = z.record(
  z.string(),
  z.object({
    nodes: z.number().int().nonnegative(),
    updatedAt: z.string(),
    previous: z.number().int().nonnegative().nullable(),
  })
);

const NOTHING_SEEN: ProvidersSeen = {};

/** In a private window, storage access throws. */
export function readSeenProviders(): ProvidersSeen {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return NOTHING_SEEN;
    }

    const stored = StoredSeenSchema.safeParse(JSON.parse(raw));

    return stored.success ? stored.data : NOTHING_SEEN;
  } catch {
    // Storage is unavailable or the key is not JSON: counting starts anew.
    return NOTHING_SEEN;
  }
}

export function writeSeenProviders(seen: ProvidersSeen): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Not saved: a background drop is noticed only while this page stays open.
  }
}
