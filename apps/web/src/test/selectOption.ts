import { screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

type User = ReturnType<typeof userEvent.setup>;

/** Reserve of presses in case the dismissing event came before the deferred listener. */
const OPEN_ATTEMPTS = 5;

/** How long to wait for options within one open attempt. */
const OPEN_TIMEOUT_MS = 250;

/**
 * Opens a dropdown and selects an option by its visible text.
 *
 * Opening has to be prepared. The Base UI trigger hangs a one-shot `mouseup` on the
 * document by a timer — after the click has released the button — and waits for
 * the next release to close on an outside press. In a browser that is the
 * next user action, while in jsdom the document is one per file: the listener
 * survives into the next test and closes the just-opened list there.
 *
 * Selection is by keyboard: Base UI handles a click on an option via pointer events,
 * which jsdom does not reproduce, and the value does not change.
 *
 * Options are looked up in the list of their own trigger, not in the whole document: a neighboring list that
 * has just closed is still finishing its exit and keeps its options in the DOM.
 */
export async function selectOption(user: User, trigger: HTMLElement, option: string): Promise<void> {
  for (let attempt = 0; attempt < OPEN_ATTEMPTS && optionsOf(trigger).length === 0; attempt += 1) {
    // Before each attempt: let timers from previous tests fire and dismiss
    // what they hung. The listeners are one-shot, and one release removes them
    // all at once; a closed list has none of its own yet.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await user.click(trigger);

    // The attempt result is awaited here, not by a common wait after the loop:
    // a listener that has not dismissed yet closes the list with the same click that
    // opens it, and without waiting the attempts coincide in phase — each
    // opens the list and loses it at once.
    await waitForOptions(trigger);
  }

  await waitFor(() => {
    expect(optionsOf(trigger).length).toBeGreaterThan(0);
  });

  const options = optionsOf(trigger);
  const target = options.find((item) => item.textContent === option);

  if (target === undefined) {
    throw new Error(`Option "${option}" is not in the list: ${options.map((item) => item.textContent).join(', ')}`);
  }

  // The highlight is moved to the start of the list and advances one step at a time with a check
  // after each: steps cannot be counted in advance — the initial highlight depends on
  // the selected value, and type-ahead search lives on its own timer and under
  // load does not keep up.
  await user.keyboard('{Home}');

  for (let step = 0; step < options.length && !target.hasAttribute('data-highlighted'); step += 1) {
    await user.keyboard('{ArrowDown}');
  }

  expect(target).toHaveAttribute('data-highlighted');

  await user.keyboard('{Enter}');
}

/** Options of this trigger's open list; a closed one has none. */
function optionsOf(trigger: HTMLElement): HTMLElement[] {
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    return [];
  }

  const listId = trigger.getAttribute('aria-controls');
  const list = screen.queryAllByRole('listbox').find((item) => item.id === listId);

  return list === undefined ? [] : within(list).queryAllByRole('option');
}

/** Waits for options; if none come, hands control to the next attempt. */
async function waitForOptions(trigger: HTMLElement): Promise<void> {
  try {
    await waitFor(
      () => {
        expect(optionsOf(trigger).length).toBeGreaterThan(0);
      },
      { timeout: OPEN_TIMEOUT_MS }
    );
  } catch {
    // The list did not open — the loop condition decides.
  }
}
