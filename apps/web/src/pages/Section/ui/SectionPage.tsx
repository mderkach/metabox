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
import { usePanelAsSheet } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
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
  SURFACE_HEAD,
  SkeletonRows,
} from '@shared/ui';
import { ConfigNode, ConfigNodeRow } from '@widgets/Config/ConfigNode';
import { ConfigSectionSettings } from '@widgets/Config/ConfigSectionSettings';

import { SectionPanel } from './SectionPanel';

const routeApi = getRouteApi('/config/$section');

/** What the panel holds: the add form or a node by its place in the section. */
type PanelTarget = { kind: 'add' } | { kind: 'node'; index: number };

/** The sheet slides away after closing, so the target outlives `open`: it would slide away empty. */
interface PanelState {
  open: boolean;
  target: PanelTarget;
}

const CLOSED: PanelState = { open: false, target: { kind: 'add' } };

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
 * A list node opens in the panel beside the list, and a node of a section with a
 * type registry is added there too (ADR-0037); below `lg` the panel opens as a
 * sheet. Object sections and lists without a registry are extended only as text.
 * In `dns` the section's own scalars sit above the servers; an object section with
 * a settings form opens it in its node.
 */
export function SectionNodes({ section }: { section: GenericSection }) {
  const { t } = useTranslation('pages/Section');
  const document = useConfigDocument();
  const status = useDaemonStatus();
  const asSheet = usePanelAsSheet();
  const [panel, setPanel] = useState<PanelState>(CLOSED);
  const text = document.text;
  const nodes = useMemo(() => (text === null ? [] : readSectionNodes(text, section)), [text, section]);
  const takenTags = useMemo(() => (text === null ? [] : readNodeTags(text)), [text]);
  const builtTags = status.data?.singboxTags ?? null;
  const shape = GENERIC_SECTIONS[section];
  const addable = shape.kind === 'list' && registryOfSection(section) !== null;
  const loaded = document.query.isSuccess;

  // A node removed from the text by other means closes its panel.
  const target = panel.target;
  const picked = target.kind === 'node' && target.index < nodes.length ? nodes[target.index] : undefined;
  const shown = panel.open && (target.kind === 'add' ? addable : picked !== undefined);
  const adding = shown && target.kind === 'add';

  function toggleAdding() {
    setPanel(adding ? { ...panel, open: false } : { open: true, target: { kind: 'add' } });
  }

  function openNode(index: number) {
    setPanel({ open: true, target: { kind: 'node', index } });
  }

  function closePanel() {
    setPanel({ ...panel, open: false });
  }

  // The new node is the last one: it opens so that its form is filled in next.
  function openAdded() {
    openNode(nodes.length);
  }

  const addButton = (
    <Button variant='outline' size='sm' aria-expanded={adding} onClick={toggleAdding}>
      <Plus data-icon='inline-start' />
      {t('add.open')}
    </Button>
  );

  const pickedNode =
    picked === undefined || target.kind !== 'node'
      ? null
      : { index: target.index, node: picked, name: nodeName(shape.path, picked, target.index) };
  // A deleted node has nothing left to show while the sheet slides away: the sheet goes at once.
  const hasSheetTarget = target.kind === 'add' ? addable : pickedNode !== null;

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      {document.isPending && <SkeletonRows className={SURFACE} />}

      {document.query.isLoadingError && <QueryFailure messageKey='source.config' query={document.query} />}

      {isSettingsSection(section) && isListSettingsSection(section) && <ConfigSectionSettings section={section} />}

      <SidePanelLayout.Root open={shown && !asSheet}>
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
            <div className={SURFACE}>
              <ConfigNode
                key={document.revision}
                section={section}
                node={nodes.length === 0 ? undefined : nodes[0]}
                name={section}
              />
            </div>
          )}

          {/* One surface for the whole section: a card per node turned a list of ten
              servers into ten separate objects of equal weight. */}
          {shape.kind === 'list' && nodes.length > 0 && (
            <div className={cn('overflow-hidden', SURFACE)}>
              <div className={cn('flex items-center justify-between gap-3', SURFACE_HEAD)}>
                <p className='text-sm text-muted-foreground'>{t('list.count', { count: nodes.length })}</p>
                {addable && addButton}
              </div>
              <ul className='divide-y divide-border'>
                {nodes.map((node, index) => (
                  <li key={index}>
                    <ConfigNodeRow
                      section={section}
                      node={node}
                      name={nodeName(shape.path, node, index)}
                      selected={shown && target.kind === 'node' && target.index === index}
                      onSelect={() => {
                        openNode(index);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SidePanelLayout.Main>

        {/* The wrapper spans the full list height, and the panel its own content height:
            otherwise it has nowhere to stick when scrolling. */}
        <SidePanelLayout.Panel className='items-start'>
          {shown && (
            <SectionPanel
              section={section}
              picked={pickedNode}
              takenTags={takenTags}
              builtTags={builtTags}
              onClose={closePanel}
              onAdded={openAdded}
              onDeleted={closePanel}
            />
          )}
        </SidePanelLayout.Panel>
      </SidePanelLayout.Root>

      {/* Below lg there is no room for the panel beside the list: there it opens as a sheet. */}
      {asSheet && hasSheetTarget && (
        <SectionPanel
          section={section}
          picked={pickedNode}
          takenTags={takenTags}
          builtTags={builtTags}
          sheet
          open={shown}
          onClose={closePanel}
          onAdded={openAdded}
          onDeleted={closePanel}
        />
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
