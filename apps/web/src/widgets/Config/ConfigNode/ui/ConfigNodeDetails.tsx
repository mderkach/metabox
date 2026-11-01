import { useTranslation } from 'react-i18next';

import { Badge } from '@shared/ui';

import { nodeSummary } from '../model';
import { ConfigNodeTypeBadge } from './ConfigNodeTypeBadge';

/**
 * What a node is recognized by beside its name: the type, the address and the mark of a node
 * the schema did not accept.
 */
export function ConfigNodeDetails({ node, name, uncovered }: { node: unknown; name: string; uncovered: boolean }) {
  const { t } = useTranslation('shared');
  const summary = nodeSummary(node);
  const type = summary.type !== null && summary.type !== name ? summary.type : null;

  if (type === null && summary.address === null && !uncovered) {
    return null;
  }

  return (
    <span className='flex min-w-0 flex-wrap items-center gap-2'>
      {type !== null && <ConfigNodeTypeBadge type={type} />}
      {summary.address !== null && (
        <span className='font-mono text-xs wrap-anywhere text-muted-foreground'>{summary.address}</span>
      )}
      {uncovered && <Badge variant='outline'>{t('rule.uncovered')}</Badge>}
    </span>
  );
}
