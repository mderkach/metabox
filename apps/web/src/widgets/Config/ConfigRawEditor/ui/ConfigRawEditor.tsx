import type { TFunction } from 'i18next';
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Search, WrapText } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { ConfigIssue } from '@entities/Config';
import { firstJsoncError } from '@shared/lib/jsonc';
import { cn } from '@shared/lib/utils';
import { Badge, Button, Input, SEARCH_FIELD, SURFACE } from '@shared/ui';

import { findMatches, lineIndexOf, toJsonTokens, tokenIndexAt, useRawEditorWrap } from '../lib';
import { ConfigRawOutline } from './ConfigRawOutline';

/** One class for all three layers: when overlaid, metrics must match to the pixel. */
const CODE_CLASS = 'font-mono text-xs/5';

/**
 * Text layout of the field and the highlight layer is one for both, otherwise wrapping
 * would diverge. Both layers reserve space for the scrollbar: the field has one, the
 * highlight does not, and without the reserve their line widths would differ by its thickness.
 */
const LAYER_CLASS = 'absolute inset-0 px-3 py-3 [scrollbar-gutter:stable]';
const LAYOUT_WRAP = 'whitespace-pre-wrap wrap-break-word';
const LAYOUT_NO_WRAP = 'whitespace-pre';

/** A match is placed in the middle of the visible area, not at its edge. */
const HALVES = 2;

/** Remarks beyond this number are named by a counter: the footer is not a journal. */
const VISIBLE_ISSUES = 3;

/** Parsing reports the position in characters — the screen needs a line. */
function lineOfPosition(text: string, position: number): number {
  return lineIndexOf(text, position) + 1;
}

function parseError(t: TFunction<'widgets/Config/ConfigRawEditor'>, text: string): string | null {
  const failure = firstJsoncError(text);

  if (failure === null) {
    return null;
  }

  return t('parseError', { line: lineOfPosition(text, failure.offset), reason: failure.text });
}

/**
 * Editing the whole config as text.
 *
 * A parse error does not erase the input or roll back the field: the text stays in
 * the form the user is typing it, and the message is shown beside it.
 * Without this there would be no way to fix a typo — the field would reset on every
 * unclosed tag.
 *
 * Highlighting is drawn as a layer under a transparent `textarea`, not by a code editor:
 * a ready-made editor weighs more than the whole panel, and tokens come from the
 * `jsonc-parser` scanner, which is already a dependency for config parsing.
 * Because of the overlay, font metrics of the layers must match to the pixel, so
 * font size and line height are set by one constant for both.
 *
 * There is no line numbering in wrap mode: the number column draws one row per
 * number, while a wrapped line takes several. They can be reconciled only by
 * measuring each line's height, and for that the highlight layer would have to be
 * split by lines.
 */
export function ConfigRawEditor({
  text,
  onChange,
  issues,
}: {
  text: string;
  onChange: (text: string) => void;
  issues: ConfigIssue[];
}) {
  const { t } = useTranslation('widgets/Config/ConfigRawEditor');
  const [draft, setDraft] = useState(text);
  const [query, setQuery] = useState('');
  const [match, setMatch] = useState(0);
  const { wrap, toggle: toggleWrap } = useRawEditorWrap();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const tokens = useMemo(() => toJsonTokens(draft), [draft]);
  const matches = useMemo(() => findMatches(draft, query), [draft, query]);
  const lines = useMemo(() => draft.split('\n').length, [draft]);
  // The parse error is found by a pass over the whole text, and a frame of lag does not
  // matter for it — it is deferred behind the input. Highlighting cannot be deferred: the field is
  // transparent over it, and a lagging layer would diverge from the text under the caret.
  const checkedDraft = useDeferredValue(draft);
  const error = useMemo(() => parseError(t, checkedDraft), [t, checkedDraft]);

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
    return lineIndexOf(draft, at) * parseFloat(globalThis.getComputedStyle(input).lineHeight);
  }

  function goToOffset(at: number, length: number) {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    input.focus();
    input.setSelectionRange(at, at + length);
    // Selection does not scroll the field by itself.
    input.scrollTop = Math.max(0, offsetTop(input, at) - input.clientHeight / HALVES);
    syncScroll();
  }

  function goToMatch(next: number) {
    if (next >= matches.length) {
      return;
    }

    setMatch(next);
    goToOffset(matches[next], query.length);
  }

  return (
    <section className='flex min-h-0 grow flex-col gap-3'>
      <div className='flex shrink-0 flex-wrap items-center gap-2'>
        <div className={SEARCH_FIELD}>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMatch(0);
            }}
            placeholder={t('search.placeholder')}
            className='pl-8'
            aria-label={t('search.label')}
          />
        </div>

        {query.length > 0 && (
          <>
            <p role='status' className='text-xs text-muted-foreground tabular-nums'>
              {matches.length === 0
                ? t('search.empty')
                : t('search.position', { current: match + 1, total: matches.length })}
            </p>
            <Button
              variant='outline'
              size='icon-sm'
              aria-label={t('search.previous')}
              disabled={matches.length === 0}
              onClick={() => {
                goToMatch((match - 1 + matches.length) % matches.length);
              }}
            >
              <ChevronUp />
            </Button>
            <Button
              variant='outline'
              size='icon-sm'
              aria-label={t('search.next')}
              disabled={matches.length === 0}
              onClick={() => {
                goToMatch((match + 1) % matches.length);
              }}
            >
              <ChevronDown />
            </Button>
          </>
        )}

        <ConfigRawOutline text={draft} onJump={goToOffset} />

        <Button
          variant='ghost'
          size='icon-sm'
          aria-pressed={wrap}
          aria-label={t('wrap')}
          onClick={toggleWrap}
          className={cn(
            'text-muted-foreground hover:text-foreground',
            wrap && 'bg-selected text-foreground ring-1 ring-selected-edge'
          )}
        >
          <WrapText />
        </Button>
      </div>

      <div className={cn('flex min-h-0 grow overflow-hidden', SURFACE)}>
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
              CODE_CLASS
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
              LAYER_CLASS,
              wrap ? LAYOUT_WRAP : LAYOUT_NO_WRAP,
              CODE_CLASS
            )}
          >
            {tokens.map((token, index) => (
              <span key={index} className={token.tone}>
                {token.text}
              </span>
            ))}
          </pre>

          <textarea
            ref={inputRef}
            id='config-raw'
            aria-label={t('editor.label')}
            spellCheck={false}
            wrap={wrap ? 'soft' : 'off'}
            value={draft}
            onScroll={syncScroll}
            onChange={(event) => {
              setDraft(event.target.value);
              onChange(event.target.value);
              setMatch(0);
            }}
            className={cn(
              'size-full resize-none overflow-auto bg-transparent text-transparent caret-foreground outline-none',
              LAYER_CLASS,
              wrap ? LAYOUT_WRAP : LAYOUT_NO_WRAP,
              CODE_CLASS
            )}
          />
        </div>
      </div>

      <footer className='flex shrink-0 flex-wrap items-center gap-2.5 text-xs'>
        <Badge variant='outline'>{t('lines', { count: lines })}</Badge>

        {error === null ? (
          <p className='flex items-center gap-1.5 text-signal-ok'>
            <CircleCheck className='size-3.5' aria-hidden='true' />
            {t('parsed')}
          </p>
        ) : (
          <p role='alert' className='flex items-center gap-1.5 text-destructive'>
            <CircleAlert className='size-3.5' aria-hidden='true' />
            {error}
          </p>
        )}

        {issues.length > 0 && (
          <div className='w-full text-muted-foreground'>
            <p>
              <Trans
                t={t}
                i18nKey='issues'
                values={{ count: issues.length }}
                components={{ code: <code className='font-mono' /> }}
              />
            </p>
            <ul className='mt-1 flex flex-col items-start gap-0.5'>
              {issues.slice(0, VISIBLE_ISSUES).map((issue) => (
                <li key={issue.text} className='font-mono text-xs'>
                  {issue.offset === null ? (
                    issue.text
                  ) : (
                    <Button
                      variant='link'
                      className='h-auto p-0 font-mono text-xs whitespace-normal text-muted-foreground underline decoration-dotted'
                      onClick={() => {
                        goToOffset(Math.min(issue.offset ?? 0, draft.length), 0);
                      }}
                    >
                      {issue.text}
                    </Button>
                  )}
                </li>
              ))}
              {issues.length > VISIBLE_ISSUES && (
                <li className='text-xs'>{t('issuesMore', { count: issues.length - VISIBLE_ISSUES })}</li>
              )}
            </ul>
          </div>
        )}
      </footer>
    </section>
  );
}
