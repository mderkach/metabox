import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  GROUP_TYPES,
  isLatencyServer,
  type OutboundMetadataMap,
  type ProxyGroup,
  type ProxyNode,
  type ServerLatencies,
} from '@entities/Proxy';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SECTION_HEADING,
} from '@shared/ui';

import { ProxyGroupCard } from './ProxyGroupCard';
import { ProxyGroupsLegend } from './ProxyGroupsLegend';
import type { ProxyNodeDiagnostics } from './ProxyNodeDiagnostic';
import { ProxyNodesTest } from './ProxyNodesTest';
import { ProxyNodeTile } from './ProxyNodeTile';
import { ProxyNormHeading } from './ProxyNormHeading';

const NODE_TILE_GRID = 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3';

const NO_OP = () => undefined;

/**
 * Proxy groups, and when there are none, a list of outbounds.
 *
 * A config without groups is a normal case, not an empty state: rules reference
 * outbounds directly, and there is nothing to switch at runtime.
 */
export function ProxyGroups({
  groups,
  nodes,
  onSelected,
  onTested,
  onTestedOutbounds,
  onGroupTestStart,
  diagnosticForNode,
  standaloneDiagnostics,
  metadata,
  latencies,
  onMetadataSaved,
}: {
  groups: ProxyGroup[];
  nodes: ProxyNode[];
  /** The runtime accepted the node selection: the screen announces the result with its live region. */
  onSelected: (group: string, node: string) => void;
  /** The group latency measurement passed. */
  onTested: (group: string) => void;
  /** The latency measurement of the outbounds passed: the config has no groups. */
  onTestedOutbounds: () => void;
  onGroupTestStart?: ((group: string, nodes: readonly string[]) => void) | undefined;
  diagnosticForNode?: ProxyNodeDiagnostics | undefined;
  standaloneDiagnostics?: readonly ProxyNode[] | undefined;
  metadata: OutboundMetadataMap | undefined;
  latencies: ServerLatencies | undefined;
  onMetadataSaved: (tag: string, label?: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const primaryGroup = new Map<string, string>();
  for (const group of groups) {
    for (const node of group.nodes) {
      if (!primaryGroup.has(node.name)) primaryGroup.set(node.name, group.name);
    }
  }
  const ungrouped =
    metadata === undefined ? (standaloneDiagnostics ?? []) : nodes.filter((node) => !primaryGroup.has(node.name));

  const outbounds = groups.length > 0 ? ungrouped : nodes;
  const showNorms = metadata !== undefined && outbounds.some(isLatencyServer);

  if (groups.length > 0) {
    return (
      <div className='flex flex-col gap-3'>
        <ProxyGroupsLegend />
        <ul className='flex flex-col gap-3'>
          {groups.map((group) => (
            <li key={group.name}>
              <ProxyGroupCard
                group={group}
                onSelected={onSelected}
                onTested={onTested}
                onGroupTestStart={onGroupTestStart}
                diagnosticForNode={diagnosticForNode}
                metadata={metadata}
                latencies={latencies}
                primaryGroup={primaryGroup}
                onMetadataSaved={onMetadataSaved}
              />
            </li>
          ))}
        </ul>
        {ungrouped.length > 0 && (
          <Card className={showNorms ? 'gap-0 py-0' : undefined}>
            <CardHeader className={cn('border-b', showNorms && 'py-2')}>
              <CardTitle className={SECTION_HEADING}>
                <h3>{t('empty.outbounds')}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className={cn('flex flex-col', showNorms ? 'px-0' : 'gap-2')}>
              {showNorms && <ProxyNormHeading />}
              <ul className={showNorms ? 'divide-y divide-border' : NODE_TILE_GRID}>
                {ungrouped.map((node) => (
                  <ProxyNodeTile
                    key={node.name}
                    node={node}
                    selectable={false}
                    onSelect={NO_OP}
                    diagnostic={diagnosticForNode?.(node.name)}
                    reserveDiagnosticSpace
                    entry={metadata?.get(node.name)}
                    latency={latencies?.get(node.name)}
                    editable={metadata !== undefined && !GROUP_TYPES.has(node.type)}
                    onMetadataSaved={onMetadataSaved}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Alert>
        <Info />
        <AlertTitle>{t('empty.title')}</AlertTitle>
        <AlertDescription>{t('empty.description')}</AlertDescription>
      </Alert>

      <Card className={showNorms ? 'gap-0 py-0' : undefined}>
        <CardHeader className={cn('border-b', showNorms && 'py-2')}>
          <CardTitle className={SECTION_HEADING}>
            <h3>{t('empty.outbounds')}</h3>
          </CardTitle>
          <CardDescription>{nodes.length}</CardDescription>
          <CardAction>
            <ProxyNodesTest
              names={nodes.map((node) => node.name)}
              label={t('empty.testOutbounds')}
              onTested={onTestedOutbounds}
            />
          </CardAction>
        </CardHeader>
        <CardContent className={cn('flex flex-col', showNorms ? 'px-0' : 'gap-3')}>
          {!showNorms && <ProxyGroupsLegend />}
          {showNorms && <ProxyNormHeading />}
          <ul className={showNorms ? 'divide-y divide-border' : NODE_TILE_GRID}>
            {nodes.map((node) => (
              <ProxyNodeTile
                key={node.name}
                node={node}
                selectable={false}
                onSelect={NO_OP}
                diagnostic={diagnosticForNode?.(node.name)}
                reserveDiagnosticSpace={diagnosticForNode !== undefined}
                entry={metadata?.get(node.name)}
                latency={latencies?.get(node.name)}
                editable={metadata !== undefined && !GROUP_TYPES.has(node.type)}
                onMetadataSaved={onMetadataSaved}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
