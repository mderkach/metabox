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
import { ConfigNodeDeleteButton } from '@features/Config/ConfigNodeDelete';
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
import { ConfigNodePanel, ConfigNodePanelSheet } from '@widgets/Config/ConfigNodePanel';
import { ConfigSectionSettings } from '@widgets/Config/ConfigSectionSettings';

import { nodeName, toShownNode, type ShownNode } from '../model';
import { SectionPanelContent } from './SectionPanelContent';

const routeApi = getRouteApi('/config/$section');

/** The node panel shows the add form instead of a list node. */
const PANEL_ADD = 'add';

interface SectionPanel {
  open: boolean;
  /** The add form or the number of a list node; kept after closing, while the sheet slides away. */
  target: typeof PANEL_ADD | number;
  /** The panel is recreated on every opening, so that focus moves to its title. */
  key: number;
}

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
 * A list node is a row: it opens in the panel beside the list, and a node of a section with
 * a type registry is added by a form in the same panel (ADR-0037); below `lg` the panel opens
 * as a sheet. Object sections and lists without a registry are extended only as text.
 * In `dns` the section's own scalars sit above the servers; an object section is its only
 * node, and it opens in place, with a settings form if it has one.
 */
export function SectionNodes({ section }: { section: GenericSection }) {
  const { t } = useTranslation('pages/Section');
  const document = useConfigDocument();
  const status = useDaemonStatus();
  const asSheet = usePanelAsSheet();
  const [panel, setPanel] = useState<SectionPanel>({ open: false, target: PANEL_ADD, key: 0 });
  // A deleted node is gone from the text, and the sheet still slides away with it, not with the add form.
  const [held, setHeld] = useState<ShownNode | null>(null);
  const text = document.text;
  const nodes = useMemo(() => (text === null ? [] : readSectionNodes(text, section)), [text, section]);
  const takenTags = useMemo(() => (text === null ? [] : readNodeTags(text)), [text]);
  const builtTags = status.data?.singboxTags ?? null;
  const shape = GENERIC_SECTIONS[section];
  const addable = shape.kind === 'list' && registryOfSection(section) !== null;
  const loaded = document.query.isSuccess;
  const { target } = panel;
  const adding = addable && target === PANEL_ADD;
  // A node that left the text (discarded changes, an edit as text) closes its panel.
  const listed = target === PANEL_ADD || target >= nodes.length ? null : toShownNode(shape.path, nodes[target], target);
  const open = panel.open && (adding || listed !== null);

  if (listed !== null && (held === null || held.node !== listed.node || held.index !== listed.index)) {
    setHeld(listed);
  }

  const shown = target === PANEL_ADD ? null : held;
  const title = shown === null ? t('add.title') : shown.name;

  // A second click on the open target closes the panel, as on the rules screen.
  function toggle(next: SectionPanel['target']) {
    setPanel((current) =>
      current.open && current.target === next
        ? { ...current, open: false }
        : { open: true, target: next, key: current.key + 1 }
    );
  }

  function toggleAdding() {
    toggle(PANEL_ADD);
  }

  function close() {
    setPanel((current) => ({ ...current, open: false }));
  }

  // The new node is the last one: it opens so that its form is filled in next.
  function openAdded() {
    setPanel((current) => ({ open: true, target: nodes.length, key: current.key + 1 }));
  }

  const addButton = (
    <Button variant='outline' size='sm' aria-expanded={open && adding} onClick={toggleAdding}>
      <Plus data-icon='inline-start' />
      {t('add.open')}
    </Button>
  );

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      {document.isPending && <SkeletonRows className={SURFACE} />}

      {document.query.isLoadingError && <QueryFailure messageKey='source.config' query={document.query} />}

      {isSettingsSection(section) && isListSettingsSection(section) && <ConfigSectionSettings section={section} />}

      <SidePanelLayout.Root open={open && !asSheet}>
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
                index={0}
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
                  // A row keeps its place by number, so that focus returns to it after the panel closes.
                  <li key={index}>
                    <ConfigNodeRow
                      section={section}
                      node={node}
                      name={nodeName(shape.path, node, index)}
                      selected={open && target === index}
                      onSelect={() => {
                        toggle(index);
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
          {open && (
            <ConfigNodePanel
              key={panel.key}
              title={title}
              actions={
                shown === null ? null : (
                  <ConfigNodeDeleteButton
                    section={section}
                    index={shown.index}
                    name={shown.name}
                    tag={shown.tag}
                    onDeleted={close}
                  />
                )
              }
              onClose={close}
            >
              <SectionPanelContent
                section={section}
                shown={shown}
                panelKey={panel.key}
                takenTags={takenTags}
                builtTags={builtTags}
                onAdded={openAdded}
              />
            </ConfigNodePanel>
          )}
        </SidePanelLayout.Panel>
      </SidePanelLayout.Root>

      {/* Below lg there is no room for the panel beside the list: there it opens as a sheet. */}
      {asSheet && (
        <ConfigNodePanelSheet
          open={open}
          title={title}
          actions={
            shown === null ? null : (
              <ConfigNodeDeleteButton
                section={section}
                index={shown.index}
                name={shown.name}
                tag={shown.tag}
                onDeleted={close}
              />
            )
          }
          onClose={close}
        >
          {(adding || shown !== null) && (
            <SectionPanelContent
              section={section}
              shown={shown}
              panelKey={panel.key}
              takenTags={takenTags}
              builtTags={builtTags}
              onAdded={openAdded}
            />
          )}
        </ConfigNodePanelSheet>
      )}
    </div>
  );
}
