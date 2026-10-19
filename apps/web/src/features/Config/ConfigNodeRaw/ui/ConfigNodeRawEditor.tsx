import type { JSONPath } from 'jsonc-parser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, findValue } from '@entities/Config';
import { failureLine, parseJsonc } from '@shared/lib/jsonc';
import { Textarea } from '@shared/ui';

/** Node indent: the same as in the config file on the device. */
const JSON_INDENT = 2;

/**
 * Editing any config node as text.
 *
 * Parsed JSON goes into the draft as it is typed, there is no save step: text
 * that only lives in the field would be lost on leaving the screen and left
 * out of Apply. Only unparsed JSON blocks the write: the validity
 * arbiter is `sing-box check` on the device, not the panel schema, otherwise a
 * node the schema does not know could be neither fixed nor saved. Schema
 * remarks on the draft are shown by the section, with the line in the text.
 *
 * A parse error does not erase the input: otherwise there would be nothing to
 * fix a typo with. The node at the path may be absent: the first parsed edit
 * creates it.
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

    // The parsed node is compared, not the text: a reformatting alone is not an edit.
    if (JSON.stringify(parsed) !== JSON.stringify(findValue(ConfigDocumentState.getState().current() ?? '', path))) {
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

      {/* The line holds its height without an error: it appears and disappears
          as the user types, and the content below must not jump. */}
      <p role='status' className='min-h-4 text-xs text-destructive'>
        {failure !== null && t('nodeEditor.notWritten', failure)}
      </p>
    </section>
  );
}
