import { useId } from 'react';

import type { GenericSection } from '@entities/Config';
import { cn } from '@shared/lib/utils';

import { nodeFormOf } from '../model';
import { ConfigNodeDetails } from './ConfigNodeDetails';

/**
 * Section node as a list row: the name, the type and the address. The whole row is the button
 * that opens the node in the panel beside the list, as a rule row does. The button is named by
 * the node name alone, the type and address describe it: glued together they read as one word.
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
  const form = nodeFormOf(section, node);
  const nameId = useId();
  const detailsId = useId();

  return (
    <button
      type='button'
      aria-pressed={selected}
      aria-labelledby={nameId}
      aria-describedby={detailsId}
      onClick={onSelect}
      className={cn(
        'relative flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none pointer-coarse:min-h-11',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <span id={nameId} className='font-mono text-sm wrap-anywhere'>
        {name}
      </span>
      <span id={detailsId} className='contents'>
        <ConfigNodeDetails node={node} name={name} uncovered={form.hasForm && !form.recognized} />
      </span>
    </button>
  );
}
