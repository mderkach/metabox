import { useId } from 'react';

import type { GenericSection } from '@entities/Config';

import { ConfigNodeEditor } from './ConfigNodeEditor';
import { ConfigNodeMeta } from './ConfigNodeMeta';

/**
 * An object section node (`ntp`, `experimental`) edited in place: the section has
 * one node, and there is no list to open it from. List nodes open in the panel
 * beside the list.
 *
 * The node draws no edge: the screen puts it into a surface.
 */
export function ConfigNode({
  section,
  node,
  name,
}: {
  section: GenericSection;
  /** The node as is, from the text; `undefined` means the section is absent from the file. */
  node: unknown;
  name: string;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className='flex flex-col gap-2 px-4 py-3'>
      <header className='flex flex-wrap items-center gap-2'>
        <h2 id={headingId} className='font-mono text-sm'>
          {name}
        </h2>
        <ConfigNodeMeta section={section} node={node} name={name} />
      </header>

      <ConfigNodeEditor section={section} index={0} node={node} name={name} />
    </section>
  );
}
