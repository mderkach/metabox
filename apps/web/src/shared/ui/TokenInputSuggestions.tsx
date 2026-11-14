import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { groupSuggestions, scrollParentOf, type TokenSuggestion, type TokenSuggestionGroup } from './TokenInput.lib';
import { TokenInputOption } from './TokenInputOption';

/** The tallest the list gets, as in its `max-h` class; a longer list scrolls inside. */
const LIST_MAX_REM = 18;

/**
 * The suggestion list of `TokenInput`. It wraps the field: the input inside
 * becomes the list's combobox. The list opens under `anchor` (the chip frame
 * with the text under it) and never flips over it; when it does not fit below,
 * the scroll container of the field scrolls up to make room.
 *
 * Without `items` the field is rendered as is, a plain input without a list.
 * Only a picked suggestion reaches `onAccept`: the field keeps its own typing,
 * and Escape on a closed list does not clear the typed text.
 */
export function TokenInputSuggestions({
  items,
  label,
  typed,
  open,
  highlighted,
  footerId,
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
  highlighted: TokenSuggestion | null;
  /** The footer says what Enter does; the input lists it in `aria-describedby`. */
  footerId: string;
  onOpenChange: (open: boolean) => void;
  onAccept: (value: string) => void;
  onHighlight: (suggestion: TokenSuggestion | null) => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const { t } = useTranslation('shared');
  const popup = useRef<HTMLDivElement | null>(null);
  const shown = open && items !== undefined && items.length > 0;
  const hasFooter = typed !== '' || highlighted !== null;
  // The source builds new suggestion objects on every render; the list gets new
  // groups only when what they show changes, or it re-highlights without end.
  const signature = JSON.stringify(items ?? []);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `items` by content
  const groups = useMemo(() => groupSuggestions(items ?? []), [signature]);

  useEffect(
    function makeRoomBelow() {
      if (!shown) {
        return;
      }

      const frame = requestAnimationFrame(function revealList() {
        const list = popup.current;
        const field = anchor.current;
        const tallest = LIST_MAX_REM * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const clipped = list === null ? 0 : Math.min(list.scrollHeight, tallest) - list.clientHeight;
        const scroller = field === null || clipped <= 0 ? null : scrollParentOf(field);

        if (scroller !== null) {
          scroller.scrollTop += clipped;
        }
      });

      return function cancelReveal() {
        cancelAnimationFrame(frame);
      };
    },
    [anchor, shown, items?.length, hasFooter]
  );

  if (items === undefined) {
    return <>{children}</>;
  }

  return (
    <AutocompletePrimitive.Root
      items={groups}
      filter={null}
      itemToStringValue={(item: TokenSuggestion) => item.value}
      value={typed}
      onValueChange={(next, details) => {
        if (details.reason === 'item-press') {
          onAccept(next);
        }
      }}
      open={shown}
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
          side='bottom'
          align='start'
          sideOffset={4}
          // A flip or a shift would lay the list over the label or the hint above it.
          collisionAvoidance={{ side: 'none', align: 'shift', fallbackAxisSide: 'none' }}
          className='isolate z-50'
        >
          <AutocompletePrimitive.Popup
            ref={popup}
            className='flex max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) flex-col overflow-y-auto overscroll-contain rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 motion-reduce:animate-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'
          >
            <AutocompletePrimitive.Status className='sr-only'>
              {t('tokenInput.suggestionCount', { count: items.length })}
            </AutocompletePrimitive.Status>
            <AutocompletePrimitive.List aria-label={t('tokenInput.suggestions', { label })} className='p-1'>
              {(group: TokenSuggestionGroup) => (
                <AutocompletePrimitive.Group key={group.value ?? ''} items={group.items}>
                  {group.value !== undefined && (
                    <AutocompletePrimitive.GroupLabel className='px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground'>
                      {group.value}
                    </AutocompletePrimitive.GroupLabel>
                  )}
                  <AutocompletePrimitive.Collection>
                    {(item: TokenSuggestion) => <TokenInputOption key={item.value} suggestion={item} />}
                  </AutocompletePrimitive.Collection>
                </AutocompletePrimitive.Group>
              )}
            </AutocompletePrimitive.List>
            {hasFooter && (
              <p
                id={footerId}
                className='sticky bottom-0 border-t border-border bg-popover px-3 py-1.5 text-xs text-pretty text-muted-foreground'
              >
                <Trans
                  t={t}
                  i18nKey={highlighted === null ? 'tokenInput.enterHint' : 'tokenInput.enterPick'}
                  values={{ value: highlighted === null ? typed : (highlighted.label ?? highlighted.value) }}
                  components={{ value: <code className='font-mono text-foreground' /> }}
                />
              </p>
            )}
          </AutocompletePrimitive.Popup>
        </AutocompletePrimitive.Positioner>
      </AutocompletePrimitive.Portal>
    </AutocompletePrimitive.Root>
  );
}
