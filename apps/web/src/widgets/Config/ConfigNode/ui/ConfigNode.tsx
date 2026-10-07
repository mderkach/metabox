import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isNodeRecognized, registryOfSection, sectionNodePath, type GenericSection } from '@entities/Config';
import { ConfigNodeForm, hasNodeOverride } from '@features/Config/ConfigNodeForm';
import { ConfigNodeRawEditor } from '@features/Config/ConfigNodeRaw';
import { cn } from '@shared/lib/utils';
import { Badge, SURFACE, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';

import { FORM_POLICY, NODE_FORM_POLICY } from '../model';

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

function isNodeObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/**
 * Узел секции конфига: форма по схеме его типа и тот же узел текстом.
 *
 * Форму получает узел секции с реестром типов, если политика реестра её
 * разрешает: автоформу — любой тип, «только оверрайды» — тип с оверрайдом. Узел, который схема его типа не принимает, формы не получает
 * вовсе: вкладка выключена, узел помечен и открыт текстом (ADR-0018).
 * Секции-объекты и секции без реестра правятся только текстом.
 */
export function ConfigNode({
  section,
  index,
  node,
  name,
  builtTags = null,
}: {
  section: GenericSection;
  index: number;
  /** Узел как есть, из текста; `undefined` — секции-объекта в файле нет. */
  node: unknown;
  /** Имя узла на экране: тег, тип или путь в файле. */
  name: string;
  /** Теги сборки бинаря: по ним форма помечает опции вне сборки; `null` — не прочитаны. */
  builtTags?: readonly string[] | null;
}) {
  const { t } = useTranslation('widgets/Config/ConfigNode');
  const registry = registryOfSection(section);
  const path = sectionNodePath(section, index);
  const type: unknown = isNodeObject(node) ? node.type : undefined;
  const hasForm =
    registry !== null &&
    (NODE_FORM_POLICY[registry] === FORM_POLICY.Auto || (typeof type === 'string' && hasNodeOverride(registry, type)));
  const recognized = hasForm && isNodeRecognized(registry, node);
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

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-2 p-4', SURFACE)}>
      <header className='flex items-center gap-2'>
        <h2 id={headingId} className='font-mono text-sm'>
          {name}
        </h2>
        {hasForm && !recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: 'shared' })}</Badge>}
      </header>

      {hasForm ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant='line'>
            <TabsTrigger value={TAB.Form} disabled={!recognized}>
              {t('tab.form')}
            </TabsTrigger>
            <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
          </TabsList>

          {/* Форма держит набранное, пока узел сверяют текстом: размонтирование его стирает. */}
          <TabsContent value={TAB.Form} keepMounted className='pt-3'>
            {recognized && isNodeObject(node) && (
              <ConfigNodeForm registry={registry} path={path} node={node} builtTags={builtTags} />
            )}
          </TabsContent>

          <TabsContent value={TAB.Raw} className='pt-3'>
            {raw}
          </TabsContent>
        </Tabs>
      ) : (
        raw
      )}
    </section>
  );
}
