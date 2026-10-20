import type { TFunction } from 'i18next';
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Search, WrapText } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { ConfigIssue } from '@entities/Config';
import { failureLine, firstJsoncError } from '@shared/lib/jsonc';
import { cn } from '@shared/lib/utils';
import { Badge, Button, Input, JsonTextarea, type JsonTextareaHandle, SEARCH_FIELD } from '@shared/ui';

import { findMatches, useRawEditorWrap } from '../lib';
import { ConfigRawOutline } from './ConfigRawOutline';

/** Remarks beyond this number are named by a counter: the footer is not a journal. */
const VISIBLE_ISSUES = 3;

function parseError(t: TFunction<'widgets/Config/ConfigRawEditor'>, text: string): string | null {
  const failure = firstJsoncError(text);

  if (failure === null) {
    return null;
  }

  return t('parseError', { line: failureLine(text, failure), reason: failure.text });
}

/**
 * Editing the whole config as text.
 *
 * A parse error does not erase the input or roll back the field: the text stays in
 * the form the user is typing it, and the message is shown beside it.
 * Without this there would be no way to fix a typo — the field would reset on every
 * unclosed tag.
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

  const editorRef = useRef<JsonTextareaHandle>(null);

  const matches = useMemo(() => findMatches(draft, query), [draft, query]);
  const lines = useMemo(() => draft.split('\n').length, [draft]);
  // The parse error is found by a pass over the whole text, and a frame of lag does not
  // matter for it — it is deferred behind the input. Highlighting cannot be deferred: the field is
  // transparent over it, and a lagging layer would diverge from the text under the caret.
  const checkedDraft = useDeferredValue(draft);
  const error = useMemo(() => parseError(t, checkedDraft), [t, checkedDraft]);

  function goToOffset(at: number, length: number) {
    editorRef.current?.select(at, length);
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

      <JsonTextarea
        ref={editorRef}
        id='config-raw'
        label={t('editor.label')}
        value={draft}
        wrap={wrap}
        height='fill'
        onChange={(next) => {
          setDraft(next);
          onChange(next);
          setMatch(0);
        }}
        className='grow'
      />

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
