import { useEffect, useRef, type RefObject } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { isTextEntryFocused } from './focus';

/**
 * Writes a form on every user change, with no save step. `write` returns
 * whether it held back a removal: an emptied key is removed when focus leaves
 * the form, not at the first erased character, otherwise the key typed back
 * would move to the end of its object. A held-back removal is also written on
 * unmount, unless `isReplaced` says the target was replaced from outside.
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
      const submit = form.handleSubmit.bind(form);

      async function writeForm(withRemovals: boolean) {
        await submit((output) => {
          held = latest.current.write(output, withRemovals);
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

      // An unconditional write here would resolve after the next change and
      // take it along.
      function writeHeldBack() {
        if (held) {
          void writeForm(true);
        }
      }

      const element = formRef.current;

      element?.addEventListener('focusout', writeHeldBack);

      return function stopWritingOnChange() {
        subscription.unsubscribe();
        element?.removeEventListener('focusout', writeHeldBack);

        if (held && !latest.current.isReplaced()) {
          void writeForm(true);
        }
      };
    },
    [form]
  );

  return formRef;
}
