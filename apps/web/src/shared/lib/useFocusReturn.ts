import { useEffect, useRef, type RefObject } from 'react';

/**
 * Фокус открывшейся панели: при монтировании панель забирает фокус на элемент,
 * на который указывает возвращённый реф, — иначе скринридер не объявит панель,
 * а фокус останется там, где был клик. При размонтировании фокус возвращается
 * туда, откуда панель открыли, если тот элемент ещё в документе: закрытие с
 * клавиатуры не должно ронять фокус на `body`. Возвращается только фокус,
 * пропавший вместе с панелью: если он уже стоит снаружи — на кнопке строки,
 * открывшей соседнюю панель, — прежняя панель его не трогает, иначе новая
 * запомнила бы источником не ту строку.
 */
export function useFocusReturn<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(function focusOnOpen() {
    const opener = document.activeElement;

    ref.current?.focus();

    return function returnFocus() {
      const lost = document.activeElement === null || document.activeElement === document.body;

      if (lost && opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus();
      }
    };
  }, []);

  return ref;
}
