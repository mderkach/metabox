import { useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProxyGroup } from '@entities/Proxy';
import { useSelectProxy } from '@features/Proxy/ProxySelect';
import { cn } from '@shared/lib/utils';
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SECTION_HEADING,
} from '@shared/ui';

import { toGroupLabel } from './ProxyGroupLabel';
import { ProxyGroupManualChoice } from './ProxyGroupManualChoice';
import type { ProxyNodeDiagnostics } from './ProxyNodeDiagnostic';
import { ProxyNodesTest } from './ProxyNodesTest';
import { ProxyNodeTile } from './ProxyNodeTile';

export function ProxyGroupCard({
  group,
  onSelected,
  onTested,
  onGroupTestStart,
  diagnosticForNode,
}: {
  group: ProxyGroup;
  onSelected: (group: string, node: string) => void;
  onTested: (group: string) => void;
  onGroupTestStart?: ((group: string, nodes: readonly string[]) => void) | undefined;
  diagnosticForNode?: ProxyNodeDiagnostics | undefined;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const select = useSelectProxy();
  const groupTitleId = useId();
  const kind = toGroupLabel(t, group.type);
  const active = group.nodes.find((node) => node.selected) ?? null;
  const names = group.nodes.map((node) => node.name);

  const onSelect = useCallback(
    (node: string) => {
      select.mutate(
        { group: group.name, node },
        {
          onSuccess: () => {
            onSelected(group.name, node);
          },
        }
      );
    },
    [group.name, onSelected, select]
  );

  return (
    <Card role='group' aria-labelledby={groupTitleId}>
      <CardHeader className='border-b'>
        <CardTitle className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1', SECTION_HEADING)}>
          <h3 id={groupTitleId} className='font-mono'>
            {group.name}
          </h3>
          <Badge variant='outline'>{kind}</Badge>
        </CardTitle>
        <CardDescription>{t('card.members', { count: group.nodes.length })}</CardDescription>
        <CardAction>
          <ProxyNodesTest
            names={names}
            label={t('card.testGroup', { group: group.name })}
            onTestStart={() => {
              onGroupTestStart?.(group.name, names);
            }}
            onTested={() => {
              onTested(group.name);
            }}
          />
        </CardAction>
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        {!group.selectable && <ProxyGroupManualChoice group={group.name} />}

        {/* The selected node already carries an edge and a checkmark: the row is needed only
            when there is no selected one and nothing to mark. */}
        {active === null && <p className='text-xs text-muted-foreground'>{t('card.none')}</p>}

        <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
          {group.nodes.map((node) => (
            <ProxyNodeTile
              key={node.name}
              node={node}
              selectable={group.selectable}
              onSelect={onSelect}
              diagnostic={diagnosticForNode?.(node.name, group.name)}
              reserveDiagnosticSpace={diagnosticForNode !== undefined}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
