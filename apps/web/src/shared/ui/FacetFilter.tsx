import { Check, ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Button } from './shadcn/button';
import { Input } from './shadcn/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './shadcn/popover';

/** Facet value and the number of rows its selection adds. */
export interface FacetValue {
  value: string;
  count: number;
}

/** Facet value in words: the label and, for a device, the address next to it. */
export interface FacetText {
  label: string;
  detail: string | null;
}

/** Touch target on a phone is at least 44px. */
const TOUCH_TARGET = 'max-md:h-11';

const OPTION =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 max-md:min-h-11';

/** Where a key moves focus in the list; `-1` means back to the search. */
const OPTION_MOVE: Readonly<Partial<Record<string, (index: number, last: number) => number>>> = {
  ArrowDown: (index, last) => Math.min(index + 1, last),
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: (_index, last) => last,
};

function focusOption(list: HTMLDivElement | null, index: number) {
  list?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus();
}

/**
 * Facet: a toolbar button and a list of values under it. Several values are
 * selected at once, each with a counter of the rows its selection will add.
 *
 * The button names the selection itself: one value by its label, several by a
 * number. Otherwise a selection hidden in a popover looks like vanished rows.
 *
 * Keyboard: from search, the down arrow leads into the list, in the list arrows
 * move over values, space and Enter toggle a value, Esc closes the popover.
 */
export function FacetFilter({
  label,
  values,
  selected,
  describe,
  onSelectedChange,
}: {
  label: string;
  values: readonly FacetValue[];
  selected: readonly string[];
  describe: (value: string) => FacetText;
  onSelectedChange: (values: readonly string[]) => void;
}) {
  const { t } = useTranslation('shared');
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosen = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === '') {
      return values;
    }

    return values.filter(
      ({ value }) => describe(value).label.toLowerCase().includes(needle) || value.toLowerCase().includes(needle)
    );
  }, [describe, query, values]);
  const focusable = Math.min(current, shown.length - 1);

  function toggle(value: string) {
    onSelectedChange(chosen.has(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && shown.length > 0) {
      event.preventDefault();
      focusOption(listRef.current, 0);
    }
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number, value: string) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle(value);

      return;
    }

    const move = OPTION_MOVE[event.key];

    if (move === undefined) {
      return;
    }

    event.preventDefault();

    const target = move(index, shown.length - 1);

    if (target < 0) {
      inputRef.current?.focus();
    } else {
      focusOption(listRef.current, target);
    }
  }

  const single = selected.length === 1;
  const summary = single ? describe(selected[0]).label : String(selected.length);
  const name = single
    ? t('facet.one', { facet: label, value: summary })
    : t('facet.several', { facet: label, count: selected.length });

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
          setCurrent(0);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant='outline'
            size='sm'
            aria-label={selected.length === 0 ? label : name}
            className={cn(
              TOUCH_TARGET,
              selected.length === 0
                ? 'border-dashed text-muted-foreground'
                : 'border-selected-edge bg-selected text-foreground hover:bg-selected'
            )}
          />
        }
      >
        {label}
        {selected.length > 0 && (
          <>
            <span aria-hidden className='text-muted-foreground'>
              ·
            </span>
            <span className={cn('max-w-32 truncate', !single && 'font-mono tabular-nums')}>{summary}</span>
          </>
        )}
        <ChevronDown className='text-muted-foreground' />
      </PopoverTrigger>

      <PopoverContent align='start' initialFocus={inputRef} className='w-72 gap-0 p-0'>
        <PopoverTitle className='sr-only'>{label}</PopoverTitle>

        <div className='border-b border-border p-1.5'>
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrent(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={t('facet.search')}
            aria-label={t('facet.searchLabel', { facet: label })}
            aria-controls={listId}
            className={TOUCH_TARGET}
          />
        </div>

        {shown.length === 0 ? (
          <p className='px-3 py-4 text-center text-xs text-muted-foreground'>{t('facet.nothing')}</p>
        ) : (
          <div
            ref={listRef}
            id={listId}
            role='listbox'
            aria-multiselectable
            aria-label={label}
            className='max-h-72 overflow-y-auto p-1'
          >
            {shown.map(({ value, count }, index) => {
              const text = describe(value);
              const checked = chosen.has(value);

              return (
                <div
                  key={value}
                  role='option'
                  aria-selected={checked}
                  tabIndex={index === focusable ? 0 : -1}
                  onClick={() => {
                    toggle(value);
                  }}
                  onKeyDown={(event) => {
                    onOptionKeyDown(event, index, value);
                  }}
                  onFocus={() => {
                    setCurrent(index);
                  }}
                  className={OPTION}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                    )}
                  >
                    {checked && <Check className='size-3' />}
                  </span>
                  <span className='min-w-0 grow truncate' title={text.detail ?? text.label}>
                    {text.label}
                  </span>
                  {text.detail !== null && (
                    <span className='shrink-0 font-mono text-xs text-muted-foreground'>{text.detail}</span>
                  )}
                  <span
                    className={cn(
                      'shrink-0 font-mono text-xs text-muted-foreground tabular-nums',
                      count === 0 && 'opacity-50'
                    )}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div className='border-t border-border p-1'>
            <Button
              variant='ghost'
              size='sm'
              className={cn('w-full', TOUCH_TARGET)}
              onClick={() => {
                onSelectedChange([]);
                // The button disappears with the selection: focus left on it
                // would go to the document.
                inputRef.current?.focus();
              }}
            >
              {t('facet.reset')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
