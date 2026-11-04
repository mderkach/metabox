import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { toDelayText } from '../lib/ProxyGroups.delay';
import { toMemberLabel } from './ProxyGroupLabel';
import { ProxyNodeContent } from './ProxyNodeContent';

/** The selected node carries an edge and a checkmark: two signs, one of them not color-based. */
function ProxyNodeTileProto({
  node,
  selectable,
  onSelect,
}: {
  node: ProxyNode;
  selectable: boolean;
  onSelect: (name: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  // The name is assembled explicitly: tile parts lie in separate blocks without spaces
  // between them, and the accessible name would glue into "usURL-test609 ms".
  const label = t('node.label', {
    name: node.name,
    type: toMemberLabel(t, node.type),
    delay: toDelayText(t, node),
  });

  // `relative` keeps the hidden label inside the tile: `sr-only` is positioned
  // absolutely, and without a positioned ancestor it goes off the screen scroll and
  // lengthens the document — the bottom navigation slides up.
  const className = cn(
    'relative flex w-full flex-col gap-1.5 rounded-md border px-2.5 py-2 text-left transition-colors',
    node.selected ? 'border-selected-edge bg-selected' : 'border-border bg-card'
  );

  return (
    <li>
      {selectable ? (
        <button
          type='button'
          className={cn(
            className,
            'hover:border-selected-edge/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
          )}
          aria-pressed={node.selected}
          aria-label={label}
          onClick={() => {
            onSelect(node.name);
          }}
        >
          <ProxyNodeContent node={node} />
        </button>
      ) : (
        <p className={className}>
          {node.selected && <span className='sr-only'>{t('node.selected')}</span>}
          <ProxyNodeContent node={node} />
        </p>
      )}
    </li>
  );
}

export const ProxyNodeTile = memo(ProxyNodeTileProto);
