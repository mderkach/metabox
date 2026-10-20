import type { JSONPath } from 'jsonc-parser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ConfigDocumentStore, findValue } from '@entities/Config';
import { failureLine, parseJsonc } from '@shared/lib/jsonc';
import { Textarea } from '@shared/ui';

/** Node indent: the same as in the config file on the device. */
const JSON_INDENT = 2;

/**
 * Any config node as text. Parsed JSON goes into the draft as it is typed; only
 * a parse error stops the write: `sing-box check` decides validity. A node
 * missing at the path is created by the first parsed edit.
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
  const [failure, setFailure] = useState<{ line: number; reason: string } | null>(null);

  const onChange = (next: string) => {
    setText(next);

    const { value: parsed, failure: parseFailure } = parseJsonc(next);

    if (parseFailure !== null) {
      setFailure({ line: failureLine(next, parseFailure), reason: parseFailure.text });

      return;
    }

    setFailure(null);

    if (JSON.stringify(parsed) !== JSON.stringify(findValue(ConfigDocumentStore.getState().current() ?? '', path))) {
      edit(path, parsed);
    }
  };

  return (
    <section className='flex flex-col gap-2'>
      <Textarea
        id={editorId}
        aria-label={label}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className='min-h-40 resize-none font-mono text-xs'
      />

      {/* Keeps its height while empty: the error comes and goes with typing. */}
      <p role='status' className='min-h-4 text-xs text-destructive'>
        {failure !== null && t('nodeEditor.notWritten', failure)}
      </p>
    </section>
  );
}
