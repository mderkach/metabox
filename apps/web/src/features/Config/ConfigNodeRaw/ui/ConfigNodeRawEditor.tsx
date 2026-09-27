import type { JSONPath } from 'jsonc-parser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState } from '@entities/Config';
import { parseJsonc } from '@shared/lib/jsonc';
import { Alert, AlertDescription, AlertTitle, Button, Textarea } from '@shared/ui';

/** Отступ узла: тот же, что у файла конфига на устройстве. */
const JSON_INDENT = 2;

/**
 * Правка любого узла конфига текстом.
 *
 * Записи мешает только неразобранный JSON: арбитр валидности — `sing-box
 * check` на устройстве, а не схема панели, иначе узел, которого схема не
 * знает, нельзя было бы ни поправить, ни сохранить. Замечания схемы к
 * черновику показывает раздел, со строкой в тексте.
 *
 * Ошибка разбора не стирает введённое: иначе исправить опечатку было бы нечем.
 * Узла по пути может не быть — сохранение его создаст.
 */
export function ConfigNodeRawEditor({
  path,
  node,
  editorId,
  label,
}: {
  path: JSONPath;
  node: unknown;
  /** Идентификатор поля: узлов на экране несколько, id обязан быть уникальным. */
  editorId: string;
  /** Доступное имя поля: узел называет его владелец-экран. */
  label: string;
}) {
  const { t } = useTranslation('shared');
  const edit = ConfigDocumentState.use.edit();
  const [text, setText] = useState(() => (node === undefined ? '{}' : JSON.stringify(node, null, JSON_INDENT)));
  // Сравнивается разобранный узел, а не текст: сохранённый в другом
  // форматировании узел иначе оставлял бы кнопку активной.
  const unchanged = node !== undefined && JSON.stringify(parseJsonc(text).value) === JSON.stringify(node);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const { value: parsed, failure } = parseJsonc(text);

    if (failure !== null) {
      setError(failure.text);

      return;
    }

    setError(null);
    edit(path, parsed);
  };

  return (
    <section className='flex flex-col gap-2'>
      <Textarea
        id={editorId}
        aria-label={label}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className='min-h-40 resize-none font-mono text-xs'
      />

      {error !== null && (
        <Alert variant='destructive'>
          <AlertTitle>{t('nodeEditor.parseFailed')}</AlertTitle>
          <AlertDescription>
            <pre className='font-mono text-xs whitespace-pre-wrap'>{error}</pre>
          </AlertDescription>
        </Alert>
      )}

      <Button size='sm' disabled={unchanged} onClick={apply} className='self-start'>
        {t('nodeEditor.submit')}
      </Button>
    </section>
  );
}
