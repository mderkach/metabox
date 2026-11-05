import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { sectionNodePath, type GenericSection } from '@entities/Config';
import { ConfigNodeForm, ConfigSectionForm } from '@features/Config/ConfigNodeForm';
import { ConfigNodeRawEditor } from '@features/Config/ConfigNodeRaw';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';

import { isNodeObject, toNodeForm } from '../model';

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

/**
 * Section node editor: a form from its type's schema and the same node as text.
 * A node the schema does not accept opens as text with the form tab disabled.
 */
export function ConfigNodeEditor({
  section,
  index,
  node,
  name,
  builtTags = null,
}: {
  section: GenericSection;
  index: number;
  /** The node as is, from the text; `undefined` means the object section is absent from the file. */
  node: unknown;
  /** Node name on screen: tag, type or path in the file. */
  name: string;
  /** Binary build tags: the form marks options outside the build by them; `null` means not read. */
  builtTags?: readonly string[] | null;
}) {
  const { t } = useTranslation('widgets/Config/ConfigNode');
  const path = sectionNodePath(section, index);
  const form = toNodeForm(section, node);
  const [tab, setTab] = useState<string>(form.recognized ? TAB.Form : TAB.Raw);

  if (!form.hasForm) {
    return (
      <ConfigNodeRawEditor
        path={path}
        node={node}
        editorId={`section-node-${section}-${String(index)}`}
        label={t('editor.label', { name })}
      />
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant='line'>
        <TabsTrigger value={TAB.Form} disabled={!form.recognized}>
          {t('tab.form')}
        </TabsTrigger>
        <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
      </TabsList>

      {/* The form keeps what was typed while the node is checked as text: unmounting erases it. */}
      <TabsContent value={TAB.Form} keepMounted className='pt-3'>
        {form.recognized && form.registry !== null && isNodeObject(node) && (
          <ConfigNodeForm registry={form.registry} path={path} node={node} builtTags={builtTags} />
        )}
        {form.recognized && form.settingsSection !== null && form.settings !== null && (
          <ConfigSectionForm section={form.settingsSection} settings={form.settings} />
        )}
      </TabsContent>

      <TabsContent value={TAB.Raw} className='pt-3'>
        <ConfigNodeRawEditor
          path={path}
          node={node}
          editorId={`section-node-${section}-${String(index)}`}
          label={t('editor.label', { name })}
        />
      </TabsContent>
    </Tabs>
  );
}
