import type { GenericSection } from '@entities/Config';
import { ConfigNodeDeleteButton } from '@features/Config/ConfigNodeDelete';

import { nodeTag } from '../lib';
import type { SectionPanelNode } from './SectionPanel';

/** Header actions of the picked node. */
export function SectionPanelActions({
  section,
  picked,
  onDeleted,
}: {
  section: GenericSection;
  picked: SectionPanelNode;
  onDeleted: () => void;
}) {
  return (
    <ConfigNodeDeleteButton
      section={section}
      index={picked.index}
      name={picked.name}
      tag={nodeTag(picked.node)}
      onDeleted={onDeleted}
    />
  );
}
