import { useState } from 'react';

import { isSameValue } from '../model';

/**
 * Field text on top of the form value. What was typed is held in its own state:
 * it cannot be restored from the value, since an unfinished list line or JSON
 * is not a value yet. A value that changed from outside (a node text edit, a
 * form reset) rewrites the text.
 */
export function useFieldText(value: unknown, format: (value: unknown) => string) {
  const [draft, setDraft] = useState(() => ({ text: format(value), value }));

  if (!isSameValue(draft.value, value)) {
    const synced = { text: format(value), value };

    setDraft(synced);

    return { text: synced.text, setDraft };
  }

  return { text: draft.text, setDraft };
}
