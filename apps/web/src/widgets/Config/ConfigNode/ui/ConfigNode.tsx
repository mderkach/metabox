import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isNodeRecognized,
  isSectionSettingsRecognized,
  isSettingsSection,
  registryOfSection,
  sectionNodePath,
  toSectionSettings,
  type GenericSection,
} from '@entities/Config';
import { ConfigNodeForm, ConfigSectionForm, hasNodeOverride } from '@features/Config/ConfigNodeForm';
import { ConfigNodeRawEditor } from '@features/Config/ConfigNodeRaw';
import { cn } from '@shared/lib/utils';
import { Badge, Button, SURFACE, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';

import { FORM_POLICY, NODE_FORM_POLICY, nodeSummary } from '../model';

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

function isNodeObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

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
 * With `onOpenChange` the node collapses to a header with the type and address. The collapsed
 * body stays mounted: what was typed in the form is not lost. The state
 * is held by the caller — the node remounts on every document revision.
 */
export function ConfigNode({
  section,
  index,
  node,
  name,
  builtTags = null,
  open = true,
  onOpenChange,
}: {
  section: GenericSection;
  index: number;
  /** The node as is, from the text; `undefined` means the object section is absent from the file. */
  node: unknown;
  /** Node name on screen: tag, type or path in the file. */
  name: string;
  /** Binary build tags: the form marks options outside the build by them; `null` means not read. */
  builtTags?: readonly string[] | null;
  open?: boolean;
  /** Without it the node does not collapse. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation('widgets/Config/ConfigNode');
  const registry = registryOfSection(section);
  const path = sectionNodePath(section, index);
  const type: unknown = isNodeObject(node) ? node.type : undefined;
  const settingsSection = registry === null && isSettingsSection(section) ? section : null;
  const settings = settingsSection === null ? null : toSectionSettings(settingsSection, node);
  const hasNodeForm =
    registry !== null &&
    (NODE_FORM_POLICY[registry] === FORM_POLICY.Auto || (typeof type === 'string' && hasNodeOverride(registry, type)));
  const hasForm = hasNodeForm || settings !== null;
  const recognized =
    (hasNodeForm && isNodeRecognized(registry, node)) ||
    (settingsSection !== null && settings !== null && isSectionSettingsRecognized(settingsSection, settings));
  const [tab, setTab] = useState<string>(recognized ? TAB.Form : TAB.Raw);
  const headingId = useId();
  const bodyId = useId();
  const summary = nodeSummary(node);

  const raw = (
    <ConfigNodeRawEditor
      path={path}
      node={node}
      editorId={`section-node-${section}-${String(index)}`}
      label={t('editor.label', { name })}
    />
  );

  const body = hasForm ? (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant='line'>
        <TabsTrigger value={TAB.Form} disabled={!recognized}>
          {t('tab.form')}
        </TabsTrigger>
        <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
      </TabsList>

      {/* The form keeps what was typed while the node is checked as text: unmounting erases it. */}
      <TabsContent value={TAB.Form} keepMounted className='pt-3'>
        {recognized && hasNodeForm && isNodeObject(node) && (
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

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-2 p-4', SURFACE)}>
      <header className='flex flex-wrap items-center gap-2'>
        <h2 id={headingId} className='font-mono text-sm'>
          {onOpenChange === undefined ? (
            name
          ) : (
            <Button
              variant='ghost'
              size='sm'
              aria-expanded={open}
              aria-controls={bodyId}
              className='-ml-2 font-mono'
              onClick={() => {
                onOpenChange(!open);
              }}
            >
              <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
              {name}
            </Button>
          )}
        </h2>
        {summary.type !== null && summary.type !== name && <Badge variant='secondary'>{summary.type}</Badge>}
        {summary.address !== null && <span className='font-mono text-xs text-muted-foreground'>{summary.address}</span>}
        {hasForm && !recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: 'shared' })}</Badge>}
      </header>

      <div id={bodyId} hidden={!open}>
        {body}
      </div>
    </section>
  );
}
