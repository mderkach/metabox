import type { KeyboardEvent } from 'react';

/** Marks the control that opens a list row: the arrow keys move focus between them. */
export const ROW_FOCUS = { 'data-row-focus': '' } as const;

const ROW_STEP: Readonly<Partial<Record<string, number>>> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * The arrow keys move focus to the next or previous row of the list the handler
 * sits on; `Enter` on a row is its own button press. Focusing a row scrolls it
 * into view, so a virtualized list renders the rows past it in time.
 */
export function moveRowFocus(event: KeyboardEvent<HTMLElement>) {
  const step = ROW_STEP[event.key];
  const { target } = event;

  if (step === undefined || !(target instanceof HTMLElement) || !target.hasAttribute('data-row-focus')) {
    return;
  }

  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-row-focus]')];
  const position = rows.indexOf(target) + step;
  const next = position < 0 ? undefined : rows.at(position);

  if (next === undefined) {
    return;
  }

  event.preventDefault();
  next.focus();
}
