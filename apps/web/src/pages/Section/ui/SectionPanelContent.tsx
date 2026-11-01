import { ConfigDocumentState, type GenericSection } from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigNode } from '@widgets/Config/ConfigNode';

import type { ShownNode } from '../model';

/** What the node panel holds: the add form or the node opened from the list. */
export function SectionPanelContent({
  section,
  shown,
  panelKey,
  takenTags,
  builtTags,
  onAdded,
}: {
  section: GenericSection;
  /** `null` means the add form. */
  shown: ShownNode | null;
  panelKey: number;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  onAdded: () => void;
}) {
  const revision = ConfigDocumentState.use.revision();

  if (shown === null) {
    return <ConfigNodeAddForm section={section} takenTags={takenTags} builtTags={builtTags} onAdded={onAdded} />;
  }

  return (
    // The revision in the key recreates the form and editor on an update not from the user:
    // after discarding changes the field must not keep the discarded text.
    <ConfigNode
      key={`${String(panelKey)}:${String(revision)}`}
      section={section}
      index={shown.index}
      node={shown.node}
      name={shown.name}
      builtTags={builtTags}
      panel
    />
  );
}
