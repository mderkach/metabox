import { getRouteApi } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GENERIC_SECTIONS,
  isGenericSection,
  isListSettingsSection,
  isSettingsSection,
  readNodeTags,
  readSectionNodes,
  registryOfSection,
  useConfigDocument,
  type GenericSection,
} from '@entities/Config';
import { useDaemonStatus } from '@entities/Daemon';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { usePanelAsSheet } from '@shared/lib/media';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  QueryFailure,
  SidePanelLayout,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { ConfigNode } from '@widgets/Config/ConfigNode';
import { ConfigNodePanel, ConfigNodePanelSheet } from '@widgets/Config/ConfigNodePanel';
import { ConfigSectionSettings } from '@widgets/Config/ConfigSectionSettings';

const routeApi = getRouteApi('/config/$section');

export function SectionPage() {
  const { section } = routeApi.useParams();

  // A foreign section name was already cut off by the route; the check here only narrows the type.
  if (!isGenericSection(section)) {
    return null;
  }

  // The section is in the key: the panel and what is typed in the add form belong to their own
  // section and do not move to a neighboring one.
  return <SectionNodes key={section} section={section} />;
}

/**
 * A config section without a screen of its own: each of its nodes opens as a form from the
 * type schema, if it has one, and as text. Nodes are read from the text, not
 * from the parsed model — a node that the schema did not accept must stay on
 * screen and be editable.
 *
 * A node of a section with a type registry is added by a form in the panel beside the list
 * (ADR-0037); below `lg` the panel opens as a sheet. Object sections and lists without
 * a registry are extended only as text. In `dns` the section's own scalars
 * sit above the servers; an object section with a settings form opens it in its node.
 */
export function SectionNodes({ section }: { section: GenericSection }) {
  const { t } = useTranslation('pages/Section');
  const document = useConfigDocument();
  const status = useDaemonStatus();
  const asSheet = usePanelAsSheet();
  const [adding, setAdding] = useState(false);
  // The node remounts on every document revision: the screen keeps the expanded ones.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const text = document.text;
  const nodes = useMemo(() => (text === null ? [] : readSectionNodes(text, section)), [text, section]);
  const takenTags = useMemo(() => (text === null ? [] : readNodeTags(text)), [text]);
  const builtTags = status.data?.singboxTags ?? null;
  const shape = GENERIC_SECTIONS[section];
  const addable = shape.kind === 'list' && registryOfSection(section) !== null;
  const loaded = document.query.isSuccess;

  function setNodeOpen(index: number, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current);

      if (open) {
        next.add(index);
      } else {
        next.delete(index);
      }

      return next;
    });
  }

  function toggleAdding() {
    setAdding((open) => !open);
  }

  function closeAdding() {
    setAdding(false);
  }

  const addButton = (
    <Button variant='outline' size='sm' aria-expanded={adding} onClick={toggleAdding}>
      <Plus data-icon='inline-start' />
      {t('add.open')}
    </Button>
  );

  const addForm = (
    <ConfigNodeAddForm section={section} takenTags={takenTags} builtTags={builtTags} onAdded={closeAdding} />
  );

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      {document.isPending && <SkeletonRows className={SURFACE} />}

      {document.query.isLoadingError && <QueryFailure messageKey='source.config' query={document.query} />}

      {isSettingsSection(section) && isListSettingsSection(section) && <ConfigSectionSettings section={section} />}

      {loaded && addable && nodes.length > 0 && <div className='flex justify-end'>{addButton}</div>}

      <SidePanelLayout.Root open={addable && adding && !asSheet}>
        <SidePanelLayout.Main className='gap-4'>
          {loaded && shape.kind === 'list' && nodes.length === 0 && (
            <Empty className='border'>
              <EmptyHeader>
                <EmptyTitle>{t('empty.title')}</EmptyTitle>
                <EmptyDescription>{t(addable ? 'empty.description' : 'empty.descriptionText')}</EmptyDescription>
              </EmptyHeader>
              {addable && <EmptyContent>{addButton}</EmptyContent>}
            </Empty>
          )}

          {loaded && shape.kind === 'object' && (
            <ConfigNode
              key={document.revision}
              section={section}
              index={0}
              node={nodes.length === 0 ? undefined : nodes[0]}
              name={section}
            />
          )}

          {shape.kind === 'list' &&
            nodes.map((node, index) => (
              // The revision in the key recreates the form and editor on an update not from
              // the user: after discarding changes the field must not keep
              // the discarded text.
              <ConfigNode
                key={`${String(document.revision)}:${String(index)}`}
                section={section}
                index={index}
                node={node}
                name={nodeName(shape.path, node, index)}
                builtTags={builtTags}
                {...(nodes.length > 1 && {
                  open: expanded.has(index),
                  onOpenChange: (open: boolean) => {
                    setNodeOpen(index, open);
                  },
                })}
              />
            ))}
        </SidePanelLayout.Main>

        {/* The wrapper spans the full list height, and the panel its own content height:
            otherwise it has nowhere to stick when scrolling. */}
        <SidePanelLayout.Panel className='items-start'>
          {adding && (
            <ConfigNodePanel title={t('add.title')} onClose={closeAdding}>
              {addForm}
            </ConfigNodePanel>
          )}
        </SidePanelLayout.Panel>
      </SidePanelLayout.Root>

      {/* Below lg there is no room for the panel beside the list: there it opens as a sheet. */}
      {addable && asSheet && (
        <ConfigNodePanelSheet open={adding} title={t('add.title')} onClose={closeAdding}>
          {addForm}
        </ConfigNodePanelSheet>
      )}
    </div>
  );
}

/**
 * Node name on screen: the tag, without it the type, without both the path in the file
 * (`dns.rules[3]`), not the tab name: the node is located in the text by it.
 */
function nodeName(path: readonly string[], node: unknown, index: number): string {
  if (typeof node === 'object' && node !== null) {
    const tag: unknown = Reflect.get(node, 'tag');

    if (typeof tag === 'string' && tag.length > 0) {
      return tag;
    }

    const type: unknown = Reflect.get(node, 'type');

    if (typeof type === 'string' && type.length > 0) {
      return type;
    }
  }

  return `${path.join('.')}[${String(index)}]`;
}
