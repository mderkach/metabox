import { memo, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DELAY_STATE,
  DELAY_TIMEOUT,
  isLatencyServer,
  toDelayLabel,
  toLatencyReading,
  type OutboundMetadata,
  type ProxyNode,
  type ServerLatency,
} from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { useProxyMetadataEditor } from '../lib/ProxyMetadata.editor';
import { ProxyCompactNodeName } from './ProxyCompactNodeName';
import { toMemberLabel } from './ProxyGroupLabel';
import { ProxyMetadataButton } from './ProxyMetadataButton';
import { ProxyMetadataForm } from './ProxyMetadataForm';
import { ProxyNodeContent } from './ProxyNodeContent';
import { ProxyNodeDiagnostic, type ProxyNodeDiagnosticInfo } from './ProxyNodeDiagnostic';
import { ProxyNodeNormReading } from './ProxyNodeNormReading';
import { ProxyNodeStatus } from './ProxyNodeStatus';
import { ProxyNormField } from './ProxyNormField';

import layout from './ProxyNodeLayout.module.css';

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
  const compact = editable && isLatencyServer(node);
  const reading = toLatencyReading(latency, entry?.normMs);
  const panelId = useId();
  const open = expanded && diagnostic !== undefined;
  const checkedDelay =
    latency?.current === null ? null : (reading.meter.delay ?? (latency === undefined ? node.delay : null));
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
      {compact ? (
        <div data-slot='proxy-node-row' className={layout.row}>
          <div data-slot='proxy-node-identity' className={cn(layout.identity, 'flex min-w-0 items-center gap-2')}>
            {selectable ? (
              <button
                type='button'
                className='min-w-0 cursor-pointer rounded-sm py-1 text-left text-xs font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11'
                aria-pressed={node.selected}
                aria-label={label}
                onClick={() => {
                  onSelect(node.name);
                }}
              >
                <ProxyCompactNodeName tag={node.name} label={entry?.label} selected={node.selected} />
              </button>
            ) : (
              <div className='min-w-0 text-xs font-medium'>
                {node.selected && <span className='sr-only'>{t('node.selected')}</span>}
                <ProxyCompactNodeName tag={node.name} label={entry?.label} selected={node.selected} />
              </div>
            )}
            <ProxyMetadataButton
              tag={node.name}
              ref={trigger}
              expanded={editing}
              editorId={editorId}
              onClick={openMetadata}
            />
          </div>
          <div
            data-slot='proxy-node-delay'
            className={cn(layout.delay, 'text-xs font-semibold whitespace-nowrap tabular-nums')}
          >
            {checkedDelay === null ||
            checkedDelay >= DELAY_TIMEOUT ||
            reading.meter.delayState === DELAY_STATE.Failed ||
            diagnostic?.status !== undefined ? (
              <span aria-hidden='true'>—</span>
            ) : (
              <data value={checkedDelay}>{t('delay.value', { ns: 'shared', value: checkedDelay })}</data>
            )}
          </div>
          <ProxyNodeNormReading reading={reading} diagnostic={diagnostic?.status} />
          <div className={layout.norm}>
            <ProxyNormField
              tag={node.name}
              usual={reading.usual}
              manual={entry?.normMs !== undefined}
              onSaved={onMetadataSaved}
            />
          </div>
          <div
            data-slot='proxy-node-status'
            className={cn(layout.status, 'flex min-h-8 min-w-0 items-center gap-1.5 pointer-coarse:min-h-11')}
          >
            <ProxyNodeStatus
              reading={reading}
              diagnostic={diagnostic?.status}
              runtimeFailure={latency === undefined && node.delayState === DELAY_STATE.Failed}
            />
            {diagnostic !== undefined && (
              <ProxyNodeDiagnostic
                diagnostic={diagnostic}
                open={open}
                panelId={panelId}
                inline
                onToggle={() => {
                  setExpanded(!expanded);
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div
          data-slot='proxy-node-row'
          className={cn(editable && 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5')}
        >
          <div data-slot='proxy-node-identity' className='relative min-w-0'>
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
                <ProxyNodeContent node={node} label={entry?.label} diagnosticStatus={diagnostic?.status} />
              </button>
            ) : (
              // A reading, not a control: no edge and no hover, so nothing invites a click. The node in
              // use keeps the opaque fill and the check mark.
              <p className={cn(base, 'border-transparent', node.selected ? 'bg-selected' : 'bg-transparent')}>
                {node.selected && <span className='sr-only'>{t('node.selected')}</span>}
                <ProxyNodeContent node={node} label={entry?.label} diagnosticStatus={diagnostic?.status} />
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
            <div>
              <ProxyMetadataButton
                tag={node.name}
                ref={trigger}
                expanded={editing}
                editorId={editorId}
                onClick={openMetadata}
              />
            </div>
          )}
        </div>
      )}
      {editing && (
        <ProxyMetadataForm id={editorId} tag={node.name} entry={entry} onClose={close} onSaved={onMetadataSaved} />
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
