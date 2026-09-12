import { useState } from 'react';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { RuleSchema } from '@shared/api/generated';
import { Alert, AlertDescription, AlertTitle, Button, Textarea } from '@shared/ui';

/** Отступ узла: тот же, что у файла конфига на устройстве. */
const JSON_INDENT = 2;

/**
 * Правка узла правила текстом (AC-23).
 *
 * Записи мешает только неразобранный JSON. Замечание схемы записи не мешает и
 * показывается предупреждением: арбитр валидности — `sing-box check` на
 * устройстве, а не схема панели (UX-4), иначе узел, которого схема не знает,
 * нельзя было бы ни поправить, ни сохранить (AC-25).
 *
 * Ошибка разбора не стирает введённое: иначе исправить опечатку было бы нечем.
 */
export function RuleRawEditor({ index, node }: { index: number; node: unknown }) {
  const edit = ConfigDocumentState.use.edit();
  const [text, setText] = useState(() => JSON.stringify(node, null, JSON_INDENT));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const apply = () => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      setError(cause instanceof SyntaxError ? cause.message : 'JSON не разобран');

      return;
    }

    const checked = RuleSchema.safeParse(parsed);

    // Замечание схемы не запрещает запись: арбитр валидности — `sing-box check`
    // на устройстве, а не схема панели (UX-4). Иначе узел, которого схема не
    // знает, нельзя было бы ни поправить, ни сохранить — а именно текстом его
    // и правят (AC-25).
    setWarning(
      checked.success
        ? null
        : checked.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
    );
    setError(null);
    edit(ruleNodePath(index), parsed);
  };

  return (
    <section className='flex flex-col gap-2'>
      <Textarea
        id={`rule-raw-${String(index)}`}
        aria-label={`Правило ${String(index)} текстом`}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className='min-h-40 resize-none font-mono text-xs'
      />

      {error !== null && (
        <Alert variant='destructive'>
          <AlertTitle>JSON не разобран</AlertTitle>
          <AlertDescription>
            <pre className='font-mono text-xs whitespace-pre-wrap'>{error}</pre>
          </AlertDescription>
        </Alert>
      )}

      {warning !== null && (
        <Alert>
          <AlertTitle>Схема этот узел не знает — записан как есть</AlertTitle>
          <AlertDescription>
            <pre className='font-mono text-xs whitespace-pre-wrap'>{warning}</pre>
          </AlertDescription>
        </Alert>
      )}

      <Button size='sm' variant='outline' onClick={apply}>
        Записать в черновик
      </Button>
    </section>
  );
}
