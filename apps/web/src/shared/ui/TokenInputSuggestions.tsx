import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import type { TokenSuggestion } from './TokenInput.lib';

/**
 * The suggestion list of `TokenInput`. It wraps the chip frame: the input inside
 * becomes the list's combobox, and the list opens under the whole frame, not
 * under the input, so it never covers the chips.
 *
 * Without `items` the field is rendered as is, a plain input without a list.
 *
 * Only a picked suggestion reaches `onAccept`: the field keeps its own typing,
 * and Escape on a closed list does not clear the typed text.
 */
export function TokenInputSuggestions({
  items,
  label,
  typed,
  open,
  onOpenChange,
  onAccept,
  onHighlight,
  anchor,
  children,
}: {
  items: readonly TokenSuggestion[] | undefined;
  label: string;
  typed: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: (value: string) => void;
  onHighlight: (suggestion: TokenSuggestion | null) => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const { t } = useTranslation('shared');

  if (items === undefined) {
    return <>{children}</>;
  }

  return (
    <AutocompletePrimitive.Root
      items={items}
      filter={null}
      itemToStringValue={(item: TokenSuggestion) => item.value}
      value={typed}
      onValueChange={(next, details) => {
        if (details.reason === 'item-press') {
          onAccept(next);
        }
      }}
      open={open && items.length > 0}
      onOpenChange={(next, details) => {
        // The next value is picked from the same list: it stays open after a pick.
        if (next || details.reason !== 'item-press') {
          onOpenChange(next);
        }
      }}
      onItemHighlighted={(item: TokenSuggestion | undefined) => {
        onHighlight(item ?? null);
      }}
    >
      {children}
      <AutocompletePrimitive.Portal>
        <AutocompletePrimitive.Positioner
          anchor={anchor}
          sideOffset={4}
          align='start'
          collisionPadding={8}
          className='isolate z-50'
        >
          <AutocompletePrimitive.Popup className='max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 motion-reduce:animate-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'>
            <AutocompletePrimitive.Status className='sr-only'>
              {t('tokenInput.suggestionCount', { count: items.length })}
            </AutocompletePrimitive.Status>
            <AutocompletePrimitive.List aria-label={t('tokenInput.suggestions', { label })}>
              {(item: TokenSuggestion) => (
                <AutocompletePrimitive.Item
                  key={item.value}
                  value={item}
                  className='flex min-h-8 w-full min-w-0 cursor-default items-center justify-between gap-3 rounded-md px-2 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground pointer-coarse:min-h-11'
                >
                  <span className='min-w-0 truncate font-mono'>{item.value}</span>
                  <span className='shrink-0 text-xs text-muted-foreground'>{item.hint}</span>
                </AutocompletePrimitive.Item>
              )}
            </AutocompletePrimitive.List>
          </AutocompletePrimitive.Popup>
        </AutocompletePrimitive.Positioner>
      </AutocompletePrimitive.Portal>
    </AutocompletePrimitive.Root>
  );
}
