import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GENERIC_SECTIONS,
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
import { moveRowFocus } from '@shared/lib/rowFocus';
import { cn } from '@shared/lib/utils';
import {
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

import { nodeName } from '../model/Section.name';
import { SectionAddButton } from './SectionAddButton';
import { SectionPanel, type SectionPanelNode } from './SectionPanel';

type PanelTarget = { kind: 'add' } | { kind: 'node'; index: number };

interface PanelState {
  open: boolean;
  target: PanelTarget;
}

const CLOSED: PanelState = { open: false, target: { kind: 'add' } };

export function SectionNodes({ section }: { section: GenericSection }) {
  const { t } = useTranslation('pages/Section');
  const document = useConfigDocument();
  const status = useDaemonStatus();
  const asSheet = usePanelAsSheet();
  const [panel, setPanel] = useState<PanelState>(CLOSED);
  // A deleted node is gone from the text, and the sheet still slides away with it, not empty.
  const [held, setHeld] = useState<SectionPanelNode | null>(null);
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

  function stepNode(step: 1 | -1) {
    const next = target.kind === 'node' ? target.index + step : -1;

    if (next >= 0 && next < nodes.length) {
      openNode(next);
    }
  }

  function closePanel() {
    setPanel({ ...panel, open: false });
  }

  // The new node is the last one: it opens so that its form is filled in next.
  function openAdded() {
    openNode(nodes.length);
  }

  const pickedNode =
    picked === undefined || target.kind !== 'node'
      ? null
      : { index: target.index, node: picked, name: nodeName(shape.path, picked, target.index) };

  if (pickedNode !== null && (held === null || held.node !== pickedNode.node || held.index !== pickedNode.index)) {
    setHeld(pickedNode);
  }

  const sheetNode = target.kind === 'add' ? null : held;
  const hasSheetTarget = target.kind === 'add' ? addable : sheetNode !== null;

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
              {addable && (
                <EmptyContent>
                  <SectionAddButton adding={adding} onAdd={toggleAdding} />
                </EmptyContent>
              )}
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
                {addable && <SectionAddButton adding={adding} onAdd={toggleAdding} />}
              </div>
              {/* The arrow keys move between the row buttons: a list handler, not an interactive list. */}
              {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above */}
              <ul className='divide-y divide-border' onKeyDown={moveRowFocus}>
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
              onStep={stepNode}
            />
          )}
        </SidePanelLayout.Panel>
      </SidePanelLayout.Root>

      {/* Below lg there is no room for the panel beside the list: there it opens as a sheet. */}
      {asSheet && hasSheetTarget && (
        <SectionPanel
          section={section}
          picked={sheetNode}
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
