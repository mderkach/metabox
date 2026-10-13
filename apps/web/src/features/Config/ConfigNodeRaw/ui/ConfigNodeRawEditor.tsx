import type { JSONPath } from 'jsonc-parser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState } from '@entities/Config';
import { parseJsonc } from '@shared/lib/jsonc';
import { Alert, AlertDescription, AlertTitle, Button, Textarea } from '@shared/ui';

/** Node indent: the same as in the config file on the device. */
const JSON_INDENT = 2;

/**
 * Editing any config node as text.
 *
 * Only unparsed JSON blocks the write: the validity arbiter is `sing-box check`
 * on the device, not the panel schema, otherwise a node the schema does not
 * know could be neither fixed nor saved. Schema remarks on the draft are shown
 * by the section, with the line in the text.
 *
 * A parse error does not erase the input: otherwise there would be nothing to
 * fix a typo with. The node at the path may be absent: saving will create it.
 */
export function ConfigNodeRawEditor({
  path,
  node,
  editorId,
  label,
}: {
  path: JSONPath;
  node: unknown;
  /** Field identifier: there are several nodes on the screen, so the id must be unique. */
  editorId: string;
  /** Accessible field name: the owner screen names the node. */
  label: string;
}) {
  const { t } = useTranslation('shared');
  const edit = ConfigDocumentState.use.edit();
  const [text, setText] = useState(() => (node === undefined ? '{}' : JSON.stringify(node, null, JSON_INDENT)));
  // The parsed node is compared, not the text: a node saved in another
  // formatting would otherwise leave the button active.
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
