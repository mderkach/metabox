import { memo, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toDelayLabel, type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { toMemberLabel } from './ProxyGroupLabel';
import { ProxyNodeContent } from './ProxyNodeContent';
import { ProxyNodeDiagnostic, type ProxyNodeDiagnosticInfo } from './ProxyNodeDiagnostic';

/**
 * A node of a selector group is a button with an edge and a hover; a node of any other
 * group is a reading. The selected node carries a fill and a check mark: two signs, one of
 * them not color-based.
 */
function ProxyNodeTileProto({
  node,
  selectable,
  onSelect,
  diagnostic,
  reserveDiagnosticSpace = false,
}: {
  node: ProxyNode;
  selectable: boolean;
  onSelect: (name: string) => void;
  diagnostic?: ProxyNodeDiagnosticInfo | undefined;
  reserveDiagnosticSpace?: boolean;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const open = expanded && diagnostic !== undefined;
  if (expanded && diagnostic === undefined) setExpanded(false);
  // The name is assembled explicitly: tile parts lie in separate blocks without spaces
  // between them, and the accessible name would glue into "usURL-test609 ms".
  const label = t('node.label', {
    name: node.name,
    type: toMemberLabel(t, node.type),
    delay: diagnostic?.status?.label ?? toDelayLabel(t, node),
  });

  // `relative` keeps the hidden label inside the tile: `sr-only` is positioned
  // absolutely, and without a positioned ancestor it goes off the screen scroll and
  // lengthens the document — the bottom navigation slides up.
  const base = cn(
    'relative flex w-full flex-col gap-1.5 rounded-md border px-2.5 py-2 text-left',
    reserveDiagnosticSpace && 'pr-11'
  );

  return (
    <li className='min-w-0'>
      <div className='relative'>
        {selectable ? (
          <button
            type='button'
            className={cn(
              base,
              'cursor-pointer transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              node.selected
                ? 'border-selected-edge bg-selected'
                : 'border-border bg-card hover:border-selected-edge/60 hover:bg-row-hover'
            )}
            aria-pressed={node.selected}
            aria-label={label}
            onClick={() => {
              onSelect(node.name);
            }}
          >
            <ProxyNodeContent node={node} diagnosticStatus={diagnostic?.status} />
          </button>
        ) : (
          // A reading, not a control: no edge and no hover, so nothing invites a click. The node in
          // use keeps the opaque fill and the check mark.
          <p className={cn(base, 'border-transparent', node.selected ? 'bg-selected' : 'bg-transparent')}>
            {node.selected && <span className='sr-only'>{t('node.selected')}</span>}
            <ProxyNodeContent node={node} diagnosticStatus={diagnostic?.status} />
          </p>
        )}
        {diagnostic !== undefined && (
          <ProxyNodeDiagnostic
            diagnostic={diagnostic}
            open={open}
            panelId={panelId}
            onToggle={() => {
              setExpanded(!expanded);
            }}
          />
        )}
      </div>
      <div
        id={panelId}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] ease-(--motion-ease-out) motion-reduce:transition-none',
          open
            ? 'grid-rows-[1fr] opacity-100 duration-(--motion-enter)'
            : 'grid-rows-[0fr] opacity-0 duration-(--motion-exit)'
        )}
      >
        <div className='min-h-0 overflow-hidden'>{diagnostic?.content}</div>
      </div>
    </li>
  );
}

export const ProxyNodeTile = memo(ProxyNodeTileProto);
