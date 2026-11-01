import { XIcon } from 'lucide-react';
import { useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Badge } from './shadcn/badge';

const SEPARATOR = /[\s,]+/;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Short values typed one by one: each one is a chip. Enter, a comma or a space
 * closes a value, and a pasted list splits into chips by itself.
 *
 * The text being typed is already the last item of `value`: a form that writes
 * on change does not wait for Enter, and a value left unclosed is not lost.
 * Backspace in an empty field takes the last chip back into the field for editing.
 */
export function TokenInput({
  value,
  onValueChange,
  label,
  isValid,
  ref,
  className,
  placeholder,
  onBlur,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange'> & {
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  /** Name of the field: the chip list and the remove buttons are named after it. */
  label: string;
  /** A chip that fails it is marked as an error; the form says why. */
  isValid?: (token: string) => boolean;
}) {
  const { t } = useTranslation('shared');
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  // The typed text is recognized by being the last value; a value set from
  // outside, such as a picked device, closes it.
  const draft = typed !== '' && value.at(-1) === typed ? typed : '';
  const tokens = draft === '' ? value : value.slice(0, -1);

  const setRef = (element: HTMLInputElement | null) => {
    input.current = element;

    if (typeof ref === 'function') {
      ref(element);
    } else if (ref !== null && ref !== undefined) {
      ref.current = element;
    }
  };

  const type = (text: string) => {
    const parts = text.split(SEPARATOR);
    const tail = parts.pop() ?? '';
    const closed = unique([...tokens, ...parts.filter((part) => part.length > 0)]);

    setTyped(tail);
    onValueChange(tail === '' ? closed : [...closed, tail]);
  };

  const close = () => {
    setTyped('');

    const closed = unique(value);

    if (closed.length !== value.length) {
      onValueChange(closed);
    }
  };

  const remove = (index: number) => {
    onValueChange(value.filter((_, at) => at !== index));
    input.current?.focus();
  };

  return (
    <div
      className={cn(
        'flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 dark:bg-input/30 dark:has-[input[aria-invalid=true]]:border-destructive/50',
        className
      )}
    >
      {tokens.length > 0 && (
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- `display: contents` drops the implicit list role in Safari
        <ul role='list' aria-label={t('tokenInput.values', { label })} className='contents'>
          {tokens.map((token, index) => {
            const invalid = isValid?.(token) === false;

            return (
              <li key={`${String(index)}:${token}`} className='max-w-full min-w-0'>
                <Badge
                  variant='secondary'
                  aria-invalid={invalid || undefined}
                  className='h-6 max-w-full gap-0.5 pr-0.5 font-mono pointer-coarse:h-8'
                >
                  <span className='min-w-0 truncate' title={token}>
                    {token}
                  </span>
                  {invalid && <span className='sr-only'>{t('tokenInput.invalid')}</span>}
                  <button
                    type='button'
                    aria-label={t('tokenInput.remove', { value: token })}
                    className='inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-7'
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    <XIcon className='size-3' aria-hidden='true' />
                  </button>
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={setRef}
        value={draft}
        placeholder={tokens.length === 0 ? placeholder : undefined}
        className='h-6 min-w-24 flex-1 bg-transparent px-1.5 font-mono text-base outline-none placeholder:text-muted-foreground md:text-sm'
        onChange={(event) => {
          type(event.target.value);
        }}
        // A one-line field drops line breaks from pasted text, and a list
        // copied one value per line would glue into one value.
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          const { selectionStart, selectionEnd } = event.currentTarget;

          event.preventDefault();
          type(
            `${draft.slice(0, selectionStart ?? draft.length)}${pasted}${draft.slice(selectionEnd ?? draft.length)}`
          );
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && draft !== '') {
            event.preventDefault();
            close();
          } else if (event.key === 'Backspace' && draft === '' && tokens.length > 0) {
            event.preventDefault();
            setTyped(tokens.at(-1) ?? '');
          }
        }}
        onBlur={(event) => {
          close();
          onBlur?.(event);
        }}
        {...props}
      />
    </div>
  );
}
