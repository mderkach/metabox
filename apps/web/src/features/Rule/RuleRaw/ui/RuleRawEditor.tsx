import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { checkRuleNode } from '@entities/Rule';
import { parseJsonc } from '@shared/lib/jsonc';
import { Alert, AlertDescription, AlertTitle, Button, Textarea } from '@shared/ui';

/** Node indent: the same as in the config file on the device. */
const JSON_INDENT = 2;

/**
 * Editing a rule node as text.
 *
 * Only unparsed JSON blocks the write. A schema remark does not block the write
 * and is shown as a warning: the validity arbiter is `sing-box check` on the
 * device, not the panel schema, otherwise a node the schema does not know could
 * be neither fixed nor saved.
 *
 * A parse error does not erase the input: otherwise there would be nothing to fix a typo with.
 */
export function RuleRawEditor({ index, node }: { index: number; node: unknown }) {
  const { t } = useTranslation('features/Rule/RuleRaw');
  const edit = ConfigDocumentState.use.edit();
  const [text, setText] = useState(() => JSON.stringify(node, null, JSON_INDENT));
  // The parsed node is compared, not the text: a node saved in another
  // formatting would otherwise leave the button active.
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
