import { useCallback, useState } from 'react';

/** Объявление живой области. Номер нужен, чтобы тот же текст подряд прозвучал снова. */
export interface LiveMessage {
  id: number;
  text: string;
}

/**
 * Состояние живой области экрана (`LiveRegion` из `shared/ui`): последнее
 * объявление и запись нового. Живёт на экране, а не в сторе: область у экрана
 * одна, и с ним же она уходит.
 */
export function useLiveRegion() {
  const [message, setMessage] = useState<LiveMessage | null>(null);

  const announce = useCallback((text: string) => {
    setMessage((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }, []);

  return { message, announce };
}
