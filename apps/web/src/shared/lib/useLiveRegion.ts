import { useCallback, useState } from 'react';

/** A live region announcement. The number is needed so the same text sounds again in a row. */
export interface LiveMessage {
  id: number;
  text: string;
}

/**
 * State of a screen's live region (`LiveRegion` from `shared/ui`): the last
 * announcement and recording a new one. Lives on the screen, not in a store: a screen has
 * one region, and it goes away with it.
 */
export function useLiveRegion() {
  const [message, setMessage] = useState<LiveMessage | null>(null);

  const announce = useCallback((text: string) => {
    setMessage((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }, []);

  return { message, announce };
}
