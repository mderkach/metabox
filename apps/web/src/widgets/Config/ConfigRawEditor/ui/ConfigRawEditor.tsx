import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { cn } from '@shared/lib/utils';
import { Badge, Button, Input } from '@shared/ui';

import { findMatches, firstParseError, lineIndexOf, toJsonTokens } from '../lib';

/** Один класс на все три слоя: при наложении метрики обязаны совпадать до пикселя. */
const CODE_CLASS = 'font-mono text-xs/5';

/** Совпадение ставится в середину видимой области, а не к её краю. */
const HALVES = 2;

/** Разбор сообщает позицию в символах — экрану нужна строка. */
function lineOfPosition(text: string, position: number): number {
  return lineIndexOf(text, position) + 1;
}

function parseError(text: string): string | null {
  const failure = firstParseError(text);

  if (failure === null) {
    return null;
  }

  return `строка ${String(lineOfPosition(text, failure.offset))}: ${failure.text}`;
}

/**
 * Правка всего конфига текстом (AC-24).
 *
 * Ошибка разбора не стирает введённое и не откатывает поле: текст остаётся в
 * том виде, в каком его печатает пользователь, а сообщение показывается рядом.
 * Без этого исправить опечатку было бы нечем — поле сбрасывалось бы на каждый
 * незакрытый тег.
 *
 * Подсветка нарисована слоем под прозрачным `textarea`, а не редактором кода:
 * готовый редактор весит больше всей панели, а токены даёт сканер
 * `jsonc-parser`, который уже стоит в зависимостях ради разбора конфига.
 * Из-за наложения метрики шрифта у слоёв обязаны совпадать до пикселя, поэтому
 * кегль и интерлиньяж заданы одной константой на оба.
 */
export function ConfigRawEditor({
  text,
  onChange,
  issues,
}: {
  text: string;
  onChange: (text: string) => void;
  issues: string[];
}) {
  const [draft, setDraft] = useState(text);
  const [query, setQuery] = useState('');
  const [match, setMatch] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const tokens = useMemo(() => toJsonTokens(draft), [draft]);
  const matches = useMemo(() => findMatches(draft, query), [draft, query]);
  const lines = useMemo(() => draft.split('\n').length, [draft]);
  const error = parseError(draft);

  function syncScroll() {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    // Прокрутка двигает слои напрямую, минуя состояние: на семистах строках
    // рендер на каждый кадр прокрутки заметно дёргает подсветку.
    if (highlightRef.current !== null) {
      highlightRef.current.scrollTop = input.scrollTop;
      highlightRef.current.scrollLeft = input.scrollLeft;
    }

    if (gutterRef.current !== null) {
      gutterRef.current.scrollTop = input.scrollTop;
    }
  }

  function goToMatch(next: number) {
    const input = inputRef.current;

    if (input === null || next >= matches.length) {
      return;
    }

    const at = matches[next];

    setMatch(next);
    input.focus();
    input.setSelectionRange(at, at + query.length);
    // Выделение само не прокручивает поле. Шаг строки берётся из DOM, а не
    // константой: кегль задан в `rem` и растёт вместе с настройкой шрифта
    // браузера, а константа в пикселях давала промах тем больше, чем дальше
    // строка.
    const step = parseFloat(globalThis.getComputedStyle(input).lineHeight);

    input.scrollTop = Math.max(0, lineIndexOf(draft, at) * step - input.clientHeight / HALVES);
    syncScroll();
  }

  return (
    <section className='flex min-h-0 grow flex-col gap-3'>
      <div className='flex shrink-0 flex-wrap items-center gap-2'>
        <div className='relative w-full max-w-72'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMatch(0);
            }}
            placeholder='Найти в конфиге'
            className='pl-8'
            aria-label='Поиск по тексту конфига'
          />
        </div>

        {query.length > 0 && (
          <>
            <p role='status' className='text-xs text-muted-foreground tabular-nums'>
              {matches.length === 0 ? 'ничего не найдено' : `${String(match + 1)} из ${String(matches.length)}`}
            </p>
            <Button
              variant='outline'
              size='icon-sm'
              aria-label='Предыдущее совпадение'
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
              aria-label='Следующее совпадение'
              disabled={matches.length === 0}
              onClick={() => {
                goToMatch((match + 1) % matches.length);
              }}
            >
              <ChevronDown />
            </Button>
          </>
        )}
      </div>

      <div className='flex min-h-0 grow overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10'>
        <div
          ref={gutterRef}
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

        <div className='relative min-w-0 grow'>
          <pre
            ref={highlightRef}
            aria-hidden='true'
            className={cn('pointer-events-none absolute inset-0 overflow-hidden px-3 py-3 whitespace-pre', CODE_CLASS)}
          >
            {tokens.map((token, index) => (
              <span key={index} className={token.tone}>
                {token.text}
              </span>
            ))}
          </pre>

          {/* Не примитив `Textarea` из `shared/ui`: он несёт собственные фон,
              рамку и радиус, а этот слой обязан быть полностью прозрачным —
              под ним лежит подсветка. */}
          <textarea
            ref={inputRef}
            id='config-raw'
            aria-label='Конфиг sing-box текстом'
            spellCheck={false}
            wrap='off'
            value={draft}
            onScroll={syncScroll}
            onChange={(event) => {
              setDraft(event.target.value);
              onChange(event.target.value);
              setMatch(0);
            }}
            className={cn(
              'absolute inset-0 size-full resize-none overflow-auto bg-transparent px-3 py-3 whitespace-pre text-transparent caret-foreground outline-none',
              CODE_CLASS
            )}
          />
        </div>
      </div>

      <footer className='flex shrink-0 flex-wrap items-center gap-2.5 text-xs'>
        <Badge variant='outline'>{lines} строк</Badge>

        {error === null ? (
          <p className='flex items-center gap-1.5 text-signal-ok'>
            <CircleCheck className='size-3.5' aria-hidden='true' />
            JSON разобран
          </p>
        ) : (
          <p role='alert' className='flex items-center gap-1.5 text-destructive'>
            <CircleAlert className='size-3.5' aria-hidden='true' />
            {error}
          </p>
        )}

        {issues.length > 0 && (
          <p className='text-muted-foreground'>
            замечаний схемы: {issues.length} — сохранить черновик они не мешают, отказать может только{' '}
            <code className='font-mono'>sing-box check</code>
          </p>
        )}
      </footer>
    </section>
  );
}
