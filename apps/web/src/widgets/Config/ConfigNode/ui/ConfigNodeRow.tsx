import type { GenericSection } from '@entities/Config';
import { cn } from '@shared/lib/utils';

import { ConfigNodeMeta } from './ConfigNodeMeta';

/**
 * A list section node as a row: the name is a button that opens the node in the
 * panel beside the list, and it covers the whole row so the type and address are
 * a click target too.
 */
export function ConfigNodeRow({
  section,
  node,
  name,
  selected,
  onSelect,
}: {
  section: GenericSection;
  node: unknown;
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-wrap items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <button
        type='button'
        aria-pressed={selected}
        onClick={onSelect}
        className='min-w-0 truncate rounded-sm font-mono text-sm outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset pointer-coarse:min-h-11'
      >
        {name}
      </button>
      <ConfigNodeMeta section={section} node={node} name={name} />
    </div>
  );
}
