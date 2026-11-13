import { useTranslation } from 'react-i18next';

import type { GenericSection } from '@entities/Config';
import { ConfigNodePanel, ConfigNodePanelSheet } from '@widgets/Config/ConfigNodePanel';

import { SectionPanelActions } from './SectionPanelActions';
import { SectionPanelBody } from './SectionPanelBody';

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
  const title = picked === null ? t('add.title') : picked.name;

  return sheet ? (
    <ConfigNodePanelSheet
      open={open}
      title={title}
      actions={
        picked === null ? undefined : <SectionPanelActions section={section} picked={picked} onDeleted={onDeleted} />
      }
      onClose={onClose}
    >
      <SectionPanelBody
        section={section}
        picked={picked}
        takenTags={takenTags}
        builtTags={builtTags}
        onAdded={onAdded}
      />
    </ConfigNodePanelSheet>
  ) : (
    <ConfigNodePanel
      key={picked?.index ?? 'add'}
      title={title}
      actions={
        picked === null ? undefined : <SectionPanelActions section={section} picked={picked} onDeleted={onDeleted} />
      }
      onClose={onClose}
    >
      <SectionPanelBody
        section={section}
        picked={picked}
        takenTags={takenTags}
        builtTags={builtTags}
        onAdded={onAdded}
      />
    </ConfigNodePanel>
  );
}
