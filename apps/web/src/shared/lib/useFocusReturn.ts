import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focus of an opened panel: on mount the panel takes focus to the element
 * the returned ref points to — otherwise a screen reader would not announce the panel,
 * and focus would stay where the click was. On unmount focus returns
 * to where the panel was opened from, if that element is still in the document: closing from the
 * keyboard must not drop focus onto `body`. Only focus that
 * vanished with the panel is returned: if it already stands outside — on the button of a row
 * that opened a neighboring panel — the previous panel does not touch it, otherwise the new one
 * would remember the wrong row as its source.
 */
export function useFocusReturn<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  // Kept across effect re-runs: Strict Mode mounts the effect twice, and the
  // second run would take the panel's own heading for where it was opened from.
  const openerRef = useRef<Element | null>(null);

  useEffect(function focusOnOpen() {
    openerRef.current ??= document.activeElement;

    const opener = openerRef.current;

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
