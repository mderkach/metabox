import { NODE_REGISTRY, registryOfSection, type GenericSection } from '@entities/Config';

import { ConfigNodeAddDivider } from './ConfigNodeAddDivider';
import { ConfigNodeAddLink } from './ConfigNodeAddLink';
import { ConfigNodeAddManual } from './ConfigNodeAddManual';

/**
 * A new node of a section with a type registry: type and tag. Other fields are
 * optional by the schema and are edited by the node form; the add form does not
 * append them, otherwise the diff would contain values the user did not set.
 * The exception is a type override template: it fills in what the type cannot
 * be built without (VLESS with Reality without uTLS is not created by the fork
 * client). An outbound can also be added from a provider's share link.
 *
 * `takenTags` are tags the new node may not repeat; `builtTags` is the binary
 * build contents, `null` means not read.
 */
export function ConfigNodeAddForm({
  section,
  takenTags,
  builtTags,
  onAdded,
}: {
  section: GenericSection;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  /** The node went into the draft: its tag. */
  onAdded?: (tag: string) => void;
}) {
  const registry = registryOfSection(section);

  if (registry === null) {
    return null;
  }

  if (registry !== NODE_REGISTRY.Outbound) {
    return (
      <ConfigNodeAddManual
        section={section}
        registry={registry}
        takenTags={takenTags}
        builtTags={builtTags}
        onAdded={onAdded}
      />
    );
  }

  return (
    <div className='flex flex-col gap-5'>
      <ConfigNodeAddLink section={section} takenTags={takenTags} onAdded={onAdded} />
      <ConfigNodeAddDivider />
      <ConfigNodeAddManual
        section={section}
        registry={registry}
        takenTags={takenTags}
        builtTags={builtTags}
        secondary
        onAdded={onAdded}
      />
    </div>
  );
}
