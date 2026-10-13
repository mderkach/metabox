import { useCallback, useState } from 'react';
import { z } from 'zod';

import { matchNarrow } from '@shared/lib/media';

const STORAGE_KEY = 'metabox.rawEditor.wrap';

/** Storage returns a string, and it can be anything: the key outlives panel versions. */
const StoredWrapSchema = z.enum(['true', 'false']);

/**
 * Without a saved choice wrapping is on for a narrow screen: the column there is about
 * 240px, and an unwrapped line is cut in the middle of a value.
 * In a private window, storage access throws.
 */
function readWrap(): boolean {
  try {
    const stored = StoredWrapSchema.safeParse(globalThis.localStorage.getItem(STORAGE_KEY));

    if (stored.success) {
      return stored.data === 'true';
    }
  } catch {
    // Storage is unavailable — screen width decides.
  }

  return matchNarrow();
}

function writeWrap(wrap: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(wrap));
  } catch {
    // Not saved — on the next open screen width decides.
  }
}

/** Line wrapping in the text editor. The choice is personal and survives a page reload. */
export function useRawEditorWrap() {
  const [wrap, setWrap] = useState(readWrap);

  // Storage is written outside the state update: React calls the updater
  // function twice in strict mode.
  const toggle = useCallback(() => {
    const next = !wrap;

    writeWrap(next);
    setWrap(next);
  }, [wrap]);

  return { wrap, toggle };
}
