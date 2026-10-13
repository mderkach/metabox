import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ProxyGroup, ProxyNode } from '@entities/Proxy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SECTION_HEADING,
} from '@shared/ui';

import { ProxyGroupCard } from './ProxyGroupCard';
import { ProxyGroupsLegend } from './ProxyGroupsLegend';
import { ProxyNodeTile } from './ProxyNodeTile';

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
}: {
  groups: ProxyGroup[];
  nodes: ProxyNode[];
  /** The runtime accepted the node selection: the screen announces the result with its live region. */
  onSelected: (group: string, node: string) => void;
  /** The group latency measurement passed. */
  onTested: (group: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  if (groups.length > 0) {
    return (
      <div className='flex flex-col gap-3'>
        <ProxyGroupsLegend />
        <ul className='flex flex-col gap-3'>
          {groups.map((group) => (
            <li key={group.name}>
              <ProxyGroupCard group={group} onSelected={onSelected} onTested={onTested} />
            </li>
          ))}
        </ul>
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

      <Card>
        <CardHeader className='border-b'>
          <CardTitle className={SECTION_HEADING}>
            <h3>{t('empty.outbounds')}</h3>
          </CardTitle>
          <CardDescription>{nodes.length}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <ProxyGroupsLegend />
          <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
            {nodes.map((node) => (
              <ProxyNodeTile key={node.name} node={node} selectable={false} onSelect={NO_OP} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
