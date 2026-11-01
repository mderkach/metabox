import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { sectionNodePath, type GenericSection } from '@entities/Config';
import { ConfigNodeForm, ConfigSectionForm } from '@features/Config/ConfigNodeForm';
import { ConfigNodeRawEditor } from '@features/Config/ConfigNodeRaw';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';

import { isNodeObject, nodeFormOf } from '../model';
import { ConfigNodeDetails } from './ConfigNodeDetails';

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

/**
 * Config section node: a form from its type's schema and the same node as text.
 *
 * A form is given to a section node with a type registry if the registry
 * policy allows it: an auto-form to any type, "overrides only" to a type with an override. A node its type's schema does not accept gets no form
 * at all: the tab is disabled, the node is marked and opened as text (ADR-0018).
 * An object section with a settings schema (`experimental`) gets the section
 * form by the same rule; other object sections and sections without a registry
 * are edited only as text.
 *
 * The node draws no edge: the screen puts it into a surface or into the node panel. In the panel
 * (`panel`) the panel title names the node, and the node has no heading of its own.
 */
export function ConfigNode({
  section,
  index,
  node,
  name,
  builtTags = null,
  panel = false,
}: {
  section: GenericSection;
  index: number;
  /** The node as is, from the text; `undefined` means the object section is absent from the file. */
  node: unknown;
  /** Node name on screen: tag, type or path in the file. */
  name: string;
  /** Binary build tags: the form marks options outside the build by them; `null` means not read. */
  builtTags?: readonly string[] | null;
  panel?: boolean;
}) {
  const { t } = useTranslation('widgets/Config/ConfigNode');
  const form = nodeFormOf(section, node);
  const { registry, settingsSection, settings, recognized } = form;
  const path = sectionNodePath(section, index);
  const [tab, setTab] = useState<string>(recognized ? TAB.Form : TAB.Raw);
  const headingId = useId();

  const raw = (
    <ConfigNodeRawEditor
      path={path}
      node={node}
      editorId={`section-node-${section}-${String(index)}`}
      label={t('editor.label', { name })}
    />
  );

  const body = form.hasForm ? (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant='line'>
        <TabsTrigger value={TAB.Form} disabled={!recognized}>
          {t('tab.form')}
        </TabsTrigger>
        <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
      </TabsList>

      {/* The form keeps what was typed while the node is checked as text: unmounting erases it. */}
      <TabsContent value={TAB.Form} keepMounted className='pt-3'>
        {recognized && form.hasNodeForm && registry !== null && isNodeObject(node) && (
          <ConfigNodeForm registry={registry} path={path} node={node} builtTags={builtTags} />
        )}
        {recognized && settingsSection !== null && settings !== null && (
          <ConfigSectionForm section={settingsSection} settings={settings} />
        )}
      </TabsContent>

      <TabsContent value={TAB.Raw} className='pt-3'>
        {raw}
      </TabsContent>
    </Tabs>
  ) : (
    raw
  );

  const uncovered = form.hasForm && !recognized;

  if (panel) {
    return (
      <div className='flex flex-col gap-3'>
        <ConfigNodeDetails node={node} name={name} uncovered={uncovered} />
        {body}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className='flex flex-col gap-2 px-4 py-3'>
      <header className='flex flex-wrap items-center gap-2'>
        <h2 id={headingId} className='font-mono text-sm'>
          {name}
        </h2>
        <ConfigNodeDetails node={node} name={name} uncovered={uncovered} />
      </header>

      {body}
    </section>
  );
}
