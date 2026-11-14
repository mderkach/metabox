import { XIcon } from 'lucide-react';
import { useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Badge } from './shadcn/badge';
import { movedHighlight, offeredSuggestions, tokenOptionId, type TokenSuggestion } from './TokenInput.lib';
import { TokenInputSuggestions } from './TokenInputSuggestions';

const SEPARATOR = /[\s,]+/;

/**
 * Short values typed one by one: each one is a chip. Enter, a comma or a space
 * (or `separator`) closes a value, and a pasted list splits into chips by itself.
 *
 * The text being typed is already the last item of `value`: a form that writes
 * on change does not wait for Enter, and a value left unclosed is not lost.
 * Backspace in an empty field takes the last chip back into the field for editing.
 *
 * With `suggestions` the field is a combobox: a list opens on focus and narrows
 * as you type, arrows move the highlight, Enter or Tab take it as a chip,
 * Escape closes the list. Nothing is highlighted until an arrow is pressed, so
 * Enter after free typing still closes the typed value.
 */
export function TokenInput({
  value,
  onValueChange,
  label,
  isValid,
  tokenLabel,
  pasteFilter,
  suggestions,
  description,
  separator = SEPARATOR,
  distinct = true,
  ref,
  className,
  placeholder,
  onBlur,
  onFocus,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange'> & {
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  /** Name of the field: the chip list and the remove buttons are named after it. */
  label: string;
  /** A chip that fails it is marked as an error; the form says why. */
  isValid?: (token: string) => boolean;
  /** A name shown on the chip before its value, such as a device for its address. */
  tokenLabel?: (token: string) => string | undefined;
  /** Pasted text before it splits into chips, such as a list without its comment lines. */
  pasteFilter?: (text: string) => string;
  /** Text under the field, such as its hint or error: the suggestion list opens below it, not over it. */
  description?: ReactNode;
  /** Values to offer for the closed chips; one that is already a chip is not offered either way. */
  suggestions?: (tokens: readonly string[]) => readonly TokenSuggestion[];
  /** What closes a value when typed or pasted; Enter always closes it. */
  separator?: RegExp;
  /** A repeated value is dropped. */
  distinct?: boolean;
}) {
  const { t } = useTranslation('shared');
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const [listOpen, setListOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  // The typed text is recognized by being the last value; a value set from
  // outside, such as a picked device, closes it.
  const draft = typed !== '' && value.at(-1) === typed ? typed : '';
  const tokens = draft === '' ? value : value.slice(0, -1);
  const offered = suggestions === undefined ? [] : offeredSuggestions(suggestions(tokens), tokens, draft);
  const listShown = listOpen && offered.length > 0;
  const picked = listShown && highlighted !== null ? offered.at(highlighted) : undefined;

  const unique = (values: readonly string[]) => (distinct ? [...new Set(values)] : [...values]);

  const setRef = (element: HTMLInputElement | null) => {
    input.current = element;

    if (typeof ref === 'function') {
      ref(element);
    } else if (ref !== null && ref !== undefined) {
      ref.current = element;
    }
  };

  const type = (text: string) => {
    const parts = text.split(separator);
    const tail = parts.pop() ?? '';
    const closed = unique([...tokens, ...parts.filter((part) => part.length > 0)]);

    setTyped(tail);
    setHighlighted(null);
    setListOpen(true);
    onValueChange(tail === '' ? closed : [...closed, tail]);
  };

  const close = () => {
    setTyped('');

    const closed = unique(value);

    if (closed.length !== value.length) {
      onValueChange(closed);
    }
  };

  const accept = (suggestion: TokenSuggestion) => {
    setTyped('');
    setHighlighted(null);
    onValueChange(unique([...tokens, suggestion.value]));
  };

  const closeList = () => {
    setListOpen(false);
    setHighlighted(null);
  };

  const remove = (index: number) => {
    onValueChange(value.filter((_, at) => at !== index));
    input.current?.focus();
  };

  return (
    <div className='relative flex w-full min-w-0 flex-col gap-1.5'>
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
              const name = tokenLabel?.(token);

              return (
                <li key={`${String(index)}:${token}`} className='max-w-full min-w-0'>
                  <Badge
                    variant='secondary'
                    aria-invalid={invalid || undefined}
                    className='h-6 max-w-full gap-0.5 pr-0.5 font-mono pointer-coarse:h-8'
                  >
                    {name !== undefined && (
                      <>
                        <span className='mr-0.5 min-w-0 truncate font-sans' title={name}>
                          {name}
                        </span>{' '}
                      </>
                    )}
                    <span
                      className={cn('min-w-0 truncate', name !== undefined && 'text-muted-foreground')}
                      title={token}
                    >
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
            const text = event.clipboardData.getData('text');
            const pasted = pasteFilter === undefined ? text : pasteFilter(text);
            const { selectionStart, selectionEnd } = event.currentTarget;

            event.preventDefault();
            type(
              `${draft.slice(0, selectionStart ?? draft.length)}${pasted}${draft.slice(selectionEnd ?? draft.length)}`
            );
          }}
          onKeyDown={(event) => {
            if (suggestions !== undefined && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              setListOpen(true);
              setHighlighted(
                movedHighlight(listShown ? highlighted : null, event.key === 'ArrowDown' ? 1 : -1, offered.length)
              );
            } else if (picked !== undefined && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
              event.preventDefault();
              accept(picked);
            } else if (event.key === 'Escape' && listShown) {
              // The list closes first; the next Escape reaches the sheet the field is in.
              event.preventDefault();
              event.stopPropagation();
              closeList();
            } else if (event.key === 'Enter' && draft !== '') {
              event.preventDefault();
              close();
            } else if (event.key === 'Backspace' && draft === '' && tokens.length > 0) {
              event.preventDefault();
              setTyped(tokens.at(-1) ?? '');
            }
          }}
          onFocus={(event) => {
            setListOpen(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            closeList();
            close();
            onBlur?.(event);
          }}
          {...(suggestions !== undefined && {
            role: 'combobox',
            'aria-autocomplete': 'list' as const,
            'aria-expanded': listShown,
            'aria-controls': listShown ? listId : undefined,
            'aria-activedescendant': picked === undefined ? undefined : tokenOptionId(listId, highlighted ?? 0),
          })}
          {...props}
        />
      </div>
      {description}
      {listShown && (
        <TokenInputSuggestions
          id={listId}
          label={label}
          items={offered}
          highlighted={highlighted}
          typed={draft}
          onPick={accept}
        />
      )}
      {suggestions !== undefined && (
        <div aria-live='polite' className='sr-only'>
          {listShown ? t('tokenInput.suggestionCount', { count: offered.length }) : ''}
        </div>
      )}
    </div>
  );
}
