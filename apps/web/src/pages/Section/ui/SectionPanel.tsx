import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, type GenericSection } from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigNodeDeleteButton } from '@features/Config/ConfigNodeDelete';
import { ConfigNodeEditor, ConfigNodeMeta } from '@widgets/Config/ConfigNode';
import { ConfigNodePanel, ConfigNodePanelSheet } from '@widgets/Config/ConfigNodePanel';

import { nodeTag } from '../lib';

/** The picked node: its place in the section, the node from the text and its name on screen. */
export interface SectionPanelNode {
  index: number;
  node: unknown;
  name: string;
}

/**
 * The section panel: the add form or the picked node with its form, text and
 * delete button. `sheet` puts it into a sheet on top of the list, where `open`
 * slides it in and out; beside the list the page mounts it only while open.
 */
export function SectionPanel({
  section,
  picked,
  takenTags,
  builtTags,
  sheet = false,
  open = true,
  onClose,
  onAdded,
  onDeleted,
}: {
  section: GenericSection;
  /** `null` means the add form. */
  picked: SectionPanelNode | null;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  sheet?: boolean;
  open?: boolean;
  onClose: () => void;
  onAdded: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('pages/Section');
  // The revision in the key recreates the form and editor on an update not from the user:
  // after discarding changes the field must not keep the discarded text.
  const revision = ConfigDocumentState.use.revision();
  const title = picked === null ? t('add.title') : picked.name;
  const actions =
    picked === null ? undefined : (
      <ConfigNodeDeleteButton
        section={section}
        index={picked.index}
        name={picked.name}
        tag={nodeTag(picked.node)}
        onDeleted={onDeleted}
      />
    );
  const body =
    picked === null ? (
      <ConfigNodeAddForm section={section} takenTags={takenTags} builtTags={builtTags} onAdded={onAdded} />
    ) : (
      <>
        <div className='flex flex-wrap items-center gap-2 empty:hidden'>
          <ConfigNodeMeta section={section} node={picked.node} name={picked.name} />
        </div>
        <ConfigNodeEditor
          key={`${String(revision)}:${String(picked.index)}`}
          section={section}
          index={picked.index}
          node={picked.node}
          name={picked.name}
          builtTags={builtTags}
        />
      </>
    );

  return sheet ? (
    <ConfigNodePanelSheet open={open} title={title} actions={actions} onClose={onClose}>
      {body}
    </ConfigNodePanelSheet>
  ) : (
    <ConfigNodePanel key={picked?.index ?? 'add'} title={title} actions={actions} onClose={onClose}>
      {body}
    </ConfigNodePanel>
  );
}
