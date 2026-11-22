import { memo, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isLatencyServer,
  toDelayLabel,
  type OutboundMetadata,
  type ProxyNode,
  type ServerLatency,
} from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { useProxyMetadataEditor } from '../lib/ProxyMetadata.editor';
import { toMemberLabel } from './ProxyGroupLabel';
import { ProxyMetadataButton } from './ProxyMetadataButton';
import { ProxyMetadataForm } from './ProxyMetadataForm';
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
  entry,
  latency,
  editable = false,
  onMetadataSaved,
}: {
  node: ProxyNode;
  selectable: boolean;
  onSelect: (name: string) => void;
  diagnostic?: ProxyNodeDiagnosticInfo | undefined;
  reserveDiagnosticSpace?: boolean;
  entry?: OutboundMetadata | undefined;
  latency?: ServerLatency | undefined;
  editable?: boolean;
  onMetadataSaved: (tag: string, label?: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const { editing, trigger, editorId, open: openMetadata, close } = useProxyMetadataEditor();
  const [expanded, setExpanded] = useState(false);
  const server = isLatencyServer(node);
  const computedNorm = latency?.computedUsualMS;
  const norm = server ? (entry?.normMs ?? computedNorm) : null;
  const normText =
    norm == null
      ? undefined
      : t(entry?.normMs === undefined ? 'metadata.computedNorm' : 'metadata.manualNorm', { value: norm });
  const panelId = useId();
  const open = expanded && diagnostic !== undefined;
  if (expanded && diagnostic === undefined) setExpanded(false);
  // The name is assembled explicitly: tile parts lie in separate blocks without spaces
  // between them, and the accessible name would glue into "usURL-test609 ms".
  const label = t('node.label', {
    name: entry?.label === undefined ? node.name : `${entry.label} ${node.name}`,
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
      <div className={cn(editable && 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5')}>
        <div className='relative min-w-0'>
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
              aria-label={normText === undefined ? label : `${label} ${normText}`}
              onClick={() => {
                onSelect(node.name);
              }}
            >
              <ProxyNodeContent
                node={node}
                label={entry?.label}
                normText={normText}
                diagnosticStatus={diagnostic?.status}
              />
            </button>
          ) : (
            // A reading, not a control: no edge and no hover, so nothing invites a click. The node in
            // use keeps the opaque fill and the check mark.
            <p className={cn(base, 'border-transparent', node.selected ? 'bg-selected' : 'bg-transparent')}>
              {node.selected && <span className='sr-only'>{t('node.selected')}</span>}
              <ProxyNodeContent
                node={node}
                label={entry?.label}
                normText={normText}
                diagnosticStatus={diagnostic?.status}
              />
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
        {editable && (
          <ProxyMetadataButton
            tag={node.name}
            server={server}
            ref={trigger}
            expanded={editing}
            editorId={editorId}
            onClick={openMetadata}
          />
        )}
      </div>
      {editing && (
        <ProxyMetadataForm
          id={editorId}
          tag={node.name}
          entry={entry}
          server={server}
          computedNorm={computedNorm}
          onClose={close}
          onSaved={onMetadataSaved}
        />
      )}
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
