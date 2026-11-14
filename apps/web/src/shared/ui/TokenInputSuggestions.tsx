import { useEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { groupSuggestions, tokenOptionId, type TokenSuggestion } from './TokenInput.lib';
import { TokenInputOption } from './TokenInputOption';

/**
 * The suggestion list of `TokenInput`, the listbox of its combobox. It opens
 * under the chip frame inside the field's own box, so it never covers the
 * label above; it brings itself into view inside the scroll container instead
 * of flipping. The list is not modal: the rest of the page stays available to
 * assistive tech, and the keyboard stays in the input.
 */
export function TokenInputSuggestions({
  id,
  label,
  items,
  highlighted,
  typed,
  onPick,
}: {
  id: string;
  label: string;
  items: readonly TokenSuggestion[];
  highlighted: number | null;
  typed: string;
  onPick: (suggestion: TokenSuggestion) => void;
}) {
  const { t } = useTranslation('shared');
  const popup = useRef<HTMLDivElement | null>(null);
  const hasFooter = typed !== '';

  useEffect(
    function bringListIntoView() {
      popup.current?.scrollIntoView({ block: 'nearest' });
    },
    [items.length, hasFooter]
  );

  useEffect(
    function followHighlight() {
      if (highlighted !== null) {
        document.getElementById(tokenOptionId(id, highlighted))?.scrollIntoView({ block: 'nearest' });
      }
    },
    [id, highlighted]
  );

  return (
    <div
      ref={popup}
      className='absolute inset-x-0 top-full z-50 mt-1 flex max-h-72 animate-in flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 fade-in-0 motion-reduce:animate-none'
    >
      <div
        id={id}
        role='listbox'
        aria-label={t('tokenInput.suggestions', { label })}
        className='overflow-y-auto overscroll-contain p-1'
      >
        {groupSuggestions(items).map((group, groupIndex) =>
          group.label === undefined ? (
            group.items.map(({ suggestion, index }) => (
              <TokenInputOption
                key={suggestion.value}
                id={tokenOptionId(id, index)}
                suggestion={suggestion}
                highlighted={index === highlighted}
                onPick={onPick}
              />
            ))
          ) : (
            <div key={group.label} role='group' aria-labelledby={`${id}-group-${String(groupIndex)}`}>
              <div
                id={`${id}-group-${String(groupIndex)}`}
                className='px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground'
              >
                {group.label}
              </div>
              {group.items.map(({ suggestion, index }) => (
                <TokenInputOption
                  key={suggestion.value}
                  id={tokenOptionId(id, index)}
                  suggestion={suggestion}
                  highlighted={index === highlighted}
                  onPick={onPick}
                />
              ))}
            </div>
          )
        )}
      </div>
      {hasFooter && (
        <p className='border-t border-border px-3 py-1.5 text-xs text-pretty text-muted-foreground'>
          <Trans
            t={t}
            i18nKey='tokenInput.enterHint'
            values={{ value: typed }}
            components={{ value: <code className='font-mono text-foreground' /> }}
          />
        </p>
      )}
    </div>
  );
}
