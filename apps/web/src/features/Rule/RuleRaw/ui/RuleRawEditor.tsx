import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { checkRuleNode } from '@entities/Rule';
import { parseJsonc } from '@shared/lib/jsonc';
import { Alert, AlertDescription, AlertTitle, Button, Textarea } from '@shared/ui';

/** Отступ узла: тот же, что у файла конфига на устройстве. */
const JSON_INDENT = 2;

/**
 * Правка узла правила текстом.
 *
 * Записи мешает только неразобранный JSON. Замечание схемы записи не мешает и
 * показывается предупреждением: арбитр валидности — `sing-box check` на
 * устройстве, а не схема панели, иначе узел, которого схема не знает, нельзя
 * было бы ни поправить, ни сохранить.
 *
 * Ошибка разбора не стирает введённое: иначе исправить опечатку было бы нечем.
 */
export function RuleRawEditor({ index, node }: { index: number; node: unknown }) {
  const { t } = useTranslation('features/Rule/RuleRaw');
  const edit = ConfigDocumentState.use.edit();
  const [text, setText] = useState(() => JSON.stringify(node, null, JSON_INDENT));
  // Сравнивается разобранный узел, а не текст: сохранённый в другом
  // форматировании узел иначе оставлял бы кнопку активной.
  const unchanged = JSON.stringify(parseJsonc(text).value) === JSON.stringify(node);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const apply = () => {
    const { value: parsed, failure } = parseJsonc(text);

    if (failure !== null) {
      setError(failure.text);

      return;
    }

    const issues = checkRuleNode(parsed);

    setWarning(issues.length === 0 ? null : issues.join('\n'));
    setError(null);
    edit(ruleNodePath(index), parsed);
  };

  return (
    <section className='flex flex-col gap-2'>
      <Textarea
        id={`rule-raw-${String(index)}`}
        aria-label={t('editor.label', { index })}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className='min-h-40 resize-none font-mono text-xs'
      />

      {error !== null && (
        <Alert variant='destructive'>
          <AlertTitle>{t('nodeEditor.parseFailed', { ns: 'shared' })}</AlertTitle>
          <AlertDescription>
            <pre className='font-mono text-xs whitespace-pre-wrap'>{error}</pre>
          </AlertDescription>
        </Alert>
      )}

      {warning !== null && (
        <Alert>
          <AlertTitle>{t('unknownNode')}</AlertTitle>
          <AlertDescription>
            <pre className='font-mono text-xs whitespace-pre-wrap'>{warning}</pre>
          </AlertDescription>
        </Alert>
      )}

      <Button size='sm' disabled={unchanged} onClick={apply}>
        {t('nodeEditor.submit', { ns: 'shared' })}
      </Button>
    </section>
  );
}
