import { useImperativeHandle, useMemo, useRef, type KeyboardEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { indentLines, indentUnit, lineIndexOf, replaceText, toJsonTokens, tokenIndexAt } from './JsonTextarea.lib';
import { JSON_CODE, JSON_HEIGHT, JSON_LAYER, JSON_LAYOUT, SURFACE } from './styles';

/** A selection is placed in the middle of the visible area, not at its edge. */
const HALVES = 2;

/** Keys that do not cancel a pressed Escape: Shift is held down before Shift+Tab. */
const RELEASE_KEYS = new Set(['Escape', 'Shift', 'Tab']);

export interface JsonTextareaHandle {
  /** Focus the field, select the range and scroll it to the middle of the visible area. */
  select: (offset: number, length: number) => void;
}

/**
 * JSON text field with highlighting and line numbers.
 *
 * Highlighting is drawn as a layer under a transparent `textarea`, not by a code editor:
 * a ready-made editor weighs more than the whole panel, and tokens come from the
 * `jsonc-parser` scanner, which is already a dependency for config parsing.
 * Because of the overlay, font metrics of the layers must match to the pixel, so
 * font size and line height are set by one constant for all of them.
 *
 * Tab and Shift+Tab indent the selected lines with the unit of the text itself. Escape frees
 * Tab for one press, so the keyboard can leave the field: the first Escape does not reach the
 * panel around, the second one does. The keys are told to a screen reader in the field description.
 *
 * There is no line numbering in wrap mode: the number column draws one row per
 * number, while a wrapped line takes several. They can be reconciled only by
 * measuring each line's height, and for that the highlight layer would have to be
 * split by lines.
 */
export function JsonTextarea({
  ref,
  id,
  label,
  value,
  onChange,
  wrap = false,
  height = 'content',
  className,
}: {
  ref?: Ref<JsonTextareaHandle>;
  id: string;
  /** Accessible field name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  wrap?: boolean;
  /** `fill` takes the height the parent gives and scrolls inside, `content` grows with the text. */
  height?: 'fill' | 'content';
  className?: string;
}) {
  const { t } = useTranslation('shared');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tabReleased = useRef(false);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const tokens = useMemo(() => toJsonTokens(value), [value]);
  const lines = useMemo(() => value.split('\n').length, [value]);
  const layout = wrap ? JSON_LAYOUT.Wrap : JSON_LAYOUT.NoWrap;

  function syncScroll() {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    // Scrolling moves the layers directly, bypassing state: on seven hundred lines
    // a render on every scroll frame noticeably jerks the highlight.
    if (highlightRef.current !== null) {
      highlightRef.current.scrollTop = input.scrollTop;
      highlightRef.current.scrollLeft = input.scrollLeft;
    }

    if (gutterRef.current !== null) {
      gutterRef.current.scrollTop = input.scrollTop;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!RELEASE_KEYS.has(event.key)) {
      tabReleased.current = false;
    }

    if (event.key === 'Escape' && !tabReleased.current) {
      tabReleased.current = true;
      event.stopPropagation();

      return;
    }

    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) {
      return;
    }

    if (tabReleased.current) {
      tabReleased.current = false;

      return;
    }

    event.preventDefault();

    const input = event.currentTarget;
    const edit = indentLines(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      indentUnit(input.value),
      event.shiftKey
    );

    if (edit !== null) {
      replaceText(input, edit);
    }
  }

  /**
   * Height of a text position. Without wrapping a line is a file line. With
   * wrapping the height comes from a highlight layer chunk: its wrapping is the same.
   */
  function offsetTop(input: HTMLTextAreaElement, at: number): number {
    if (wrap) {
      const token = highlightRef.current?.children.item(tokenIndexAt(tokens, at));

      if (token instanceof HTMLElement) {
        return token.offsetTop;
      }
    }

    // The line step is taken from the DOM, not a constant: the font size is set in `rem` and grows
    // with the browser font setting, while a pixel constant would miss
    // more the farther the line.
    return lineIndexOf(value, at) * parseFloat(globalThis.getComputedStyle(input).lineHeight);
  }

  useImperativeHandle(ref, () => ({
    select(at, length) {
      const input = inputRef.current;

      if (input === null) {
        return;
      }

      input.focus();
      input.setSelectionRange(at, at + length);
      // Selection does not scroll the field by itself.
      input.scrollTop = Math.max(0, offsetTop(input, at) - input.clientHeight / HALVES);
      syncScroll();
    },
  }));

  return (
    <div
      className={cn('flex min-h-0 overflow-hidden focus-within:ring-2 focus-within:ring-ring/50', SURFACE, className)}
    >
      {!wrap && (
        <div
          // The column returns when wrapping is turned off with zero scroll,
          // while the field does not lose its own and sends no scroll event: without a check on
          // mount the numbers would start from one above the middle of the file.
          ref={(node) => {
            gutterRef.current = node;
            syncScroll();
          }}
          aria-hidden='true'
          className={cn(
            'shrink-0 overflow-hidden border-r border-border bg-muted/20 py-3 text-right select-none',
            JSON_CODE
          )}
        >
          {Array.from({ length: lines }, (_, index) => (
            <div key={index} className='px-2.5 text-muted-foreground/60 tabular-nums'>
              {index + 1}
            </div>
          ))}
        </div>
      )}

      <div className='relative min-w-0 grow'>
        <pre
          ref={highlightRef}
          aria-hidden='true'
          className={cn(
            'pointer-events-none overflow-hidden',
            height === 'fill' ? JSON_HEIGHT.Fill : JSON_HEIGHT.Content,
            JSON_LAYER,
            layout,
            JSON_CODE
          )}
        >
          {tokens.map((token, index) => (
            <span key={index} className={token.tone}>
              {token.text}
            </span>
          ))}
          {/* A trailing line feed draws no line in `pre`, while the field shows it: without
              this one the empty last line would be missing from the layer and its height. */}
          {'\n'}
        </pre>

        <textarea
          ref={inputRef}
          id={id}
          aria-label={label}
          aria-describedby={`${id}-keys`}
          spellCheck={false}
          wrap={wrap ? 'soft' : 'off'}
          value={value}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onBlur={() => {
            tabReleased.current = false;
          }}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={cn(
            'absolute inset-0 size-full resize-none overflow-auto bg-transparent text-transparent caret-foreground outline-none',
            JSON_LAYER,
            layout,
            JSON_CODE
          )}
        />
        <span id={`${id}-keys`} className='sr-only'>
          {t('jsonTextarea.keys')}
        </span>
      </div>
    </div>
  );
}
