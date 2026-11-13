import { ConfigDocumentState, type GenericSection } from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigNodeEditor, ConfigNodeMeta } from '@widgets/Config/ConfigNode';

import type { SectionPanelNode } from './SectionPanel';

/** The add form, or the picked node with its meta and editor. */
export function SectionPanelBody({
  section,
  picked,
  takenTags,
  builtTags,
  onAdded,
}: {
  section: GenericSection;
  /** `null` means the add form. */
  picked: SectionPanelNode | null;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  onAdded: () => void;
}) {
  // The revision in the key recreates the form and editor on an update not from the user:
  // after discarding changes the field must not keep the discarded text.
  const revision = ConfigDocumentState.use.revision();

  if (picked === null) {
    return <ConfigNodeAddForm section={section} takenTags={takenTags} builtTags={builtTags} onAdded={onAdded} />;
  }

  return (
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
}
