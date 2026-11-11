import { useEffect, useRef, type RefObject } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { isTextEntryFocused } from './focus';

/** Everything but the dirty baseline stays; `reset` merges the form `resetOptions` in, so `keepDirtyValues` is off here. */
const REBASE = {
  keepDirtyValues: false,
  keepValues: true,
  keepErrors: true,
  keepTouched: true,
  keepIsValid: true,
  keepIsSubmitted: true,
  keepSubmitCount: true,
} as const;

/**
 * Writes a form on every user change, with no save step. `write` returns
 * whether it held back a removal: an emptied key is removed when focus leaves
 * the form, not at the first erased character, otherwise the key typed back
 * would move to the end of its object. A held-back removal is also written on
 * unmount, unless `isReplaced` says the target was replaced from outside.
 *
 * Once focus leaves the form with everything written, the written values
 * become the form baseline: `keepDirtyValues` then guards only what is typed
 * after it, and an outside edit of a field changed earlier reaches the form.
 * Touched state survives, so fields keep their place in the layout.
 *
 * The returned ref goes on the `<form>`.
 */
export function useWriteOnChange<TValues extends FieldValues, TContext, TOutput>(
  form: UseFormReturn<TValues, TContext, TOutput>,
  write: (output: TOutput, withRemovals: boolean) => boolean,
  isReplaced: () => boolean
): RefObject<HTMLFormElement | null> {
  const formRef = useRef<HTMLFormElement>(null);
  const latest = useRef({ write, isReplaced });

  useEffect(function rememberLatestWrite() {
    latest.current = { write, isReplaced };
  });

  useEffect(
    function writeOnChange() {
      let held = false;
      let written = true;
      const submit = form.handleSubmit.bind(form);

      async function writeForm(withRemovals: boolean) {
        written = false;
        await submit((output) => {
          held = latest.current.write(output, withRemovals);
          written = true;
        })();
      }

      // A reset from `values` sets untouched fields with `setValue`: only a
      // user change is written, or the half-reset form would overwrite an
      // edit that came from outside.
      const subscription = form.watch(function writeUserChange(_values, { type }) {
        if (type === 'change') {
          void writeForm(!isTextEntryFocused());
        }
      });

      const element = formRef.current;

      // An unconditional write here would resolve after the next change and
      // take it along.
      async function writeHeldBack(event: FocusEvent) {
        if (held) {
          await writeForm(true);
        }

        const stays = event.relatedTarget instanceof Node && element?.contains(event.relatedTarget) === true;

        if (!stays && written && !held) {
          form.reset(form.getValues(), REBASE);
        }
      }

      function onFocusOut(event: FocusEvent) {
        void writeHeldBack(event);
      }

      element?.addEventListener('focusout', onFocusOut);

      return function stopWritingOnChange() {
        subscription.unsubscribe();
        element?.removeEventListener('focusout', onFocusOut);

        if (held && !latest.current.isReplaced()) {
          void writeForm(true);
        }
      };
    },
    [form]
  );

  return formRef;
}
