import { CircleAlert, CircleCheck } from 'lucide-react';
import { useState } from 'react';

import { Badge, Textarea } from '@shared/ui';

/** Разбор JSON сообщает позицию в символах — экрану нужна строка. */
function lineOfPosition(text: string, position: number): number {
  return text.slice(0, position).split('\n').length;
}

function parseError(text: string): string | null {
  try {
    JSON.parse(text);

    return null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      return 'JSON не разобран';
    }

    const at = /position (\d+)/.exec(error.message)?.[1];

    return at === undefined ? error.message : `строка ${String(lineOfPosition(text, Number(at)))}: ${error.message}`;
  }
}

/**
 * Правка всего конфига текстом (AC-24).
 *
 * Ошибка разбора не стирает введённое и не откатывает поле: текст остаётся в
 * том виде, в каком его печатает пользователь, а сообщение показывается рядом.
 * Без этого исправить опечатку было бы нечем — поле сбрасывалось бы на каждый
 * незакрытый тег.
 *
 * Подсветки синтаксиса и свёртки узлов здесь намеренно нет: редактор кода
 * добавил бы к бандлу больше, чем весит вся панель, и это записано отдельной
 * строкой в `docs/TechDebt.md`.
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
  const error = parseError(draft);
  const lines = draft.split('\n').length;

  return (
    <section className='flex min-h-0 grow flex-col gap-3'>
      <Textarea
        id='config-raw'
        aria-label='Конфиг sing-box текстом'
        spellCheck={false}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        className='min-h-0 grow resize-none font-mono text-xs leading-relaxed'
      />

      <footer className='flex flex-wrap items-center gap-2.5 text-xs'>
        <Badge variant='outline'>{lines} строк</Badge>

        {error === null ? (
          <p className='flex items-center gap-1.5 text-muted-foreground'>
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
