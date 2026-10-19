import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, findValue, ruleNodePath } from '@entities/Config';
import { checkRuleNode } from '@entities/Rule';
import { failureLine, parseJsonc } from '@shared/lib/jsonc';
import { Alert, AlertDescription, AlertTitle, Textarea } from '@shared/ui';

/** Node indent: the same as in the config file on the device. */
const JSON_INDENT = 2;

/**
 * A rule node as text. Parsed JSON goes into the draft as it is typed; only a
 * parse error stops the write, a schema remark is a warning: `sing-box check`
 * decides validity.
 */
export function RuleRawEditor({ index, node }: { index: number; node: unknown }) {
  const { t } = useTranslation('features/Rule/RuleRaw');
  const edit = ConfigDocumentState.use.edit();
  const [text, setText] = useState(() => JSON.stringify(node, null, JSON_INDENT));
  const [failure, setFailure] = useState<{ line: number; reason: string } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const onChange = (next: string) => {
    setText(next);

    const { value: parsed, failure: parseFailure } = parseJsonc(next);

    if (parseFailure !== null) {
      setFailure({ line: failureLine(next, parseFailure), reason: parseFailure.text });

      return;
    }

    setFailure(null);

    const issues = checkRuleNode(parsed);

    setWarning(issues.length === 0 ? null : issues.join('\n'));

    const path = ruleNodePath(index);

    if (JSON.stringify(parsed) !== JSON.stringify(findValue(ConfigDocumentState.getState().current() ?? '', path))) {
      edit(path, parsed);
    }
  };

  return (
    <section className='flex flex-col gap-2'>
      <Textarea
        id={`rule-raw-${String(index)}`}
        aria-label={t('editor.label', { index })}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className='min-h-40 resize-none font-mono text-xs'
      />

      {/* Keeps its height while empty: the error comes and goes with typing. */}
      <p role='status' className='min-h-4 text-xs text-destructive'>
        {failure !== null && t('nodeEditor.notWritten', { ns: 'shared', ...failure })}
      </p>

      {warning !== null && (
        <Alert>
          <AlertTitle>{t('unknownNode')}</AlertTitle>
          <AlertDescription>
            <pre className='font-mono text-xs whitespace-pre-wrap'>{warning}</pre>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
