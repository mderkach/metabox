import { useTranslation } from 'react-i18next';

import type { GenericSection } from '@entities/Config';
import { Badge } from '@shared/ui';

import { nodeSummary, toNodeForm } from '../model';
import { ConfigNodeTypeBadge } from './ConfigNodeTypeBadge';

/** What a node is recognized by beside its name: the type, the address and a mark when the schema does not accept it. */
export function ConfigNodeMeta({ section, node, name }: { section: GenericSection; node: unknown; name: string }) {
  const { t } = useTranslation('shared');
  const summary = nodeSummary(node);
  const form = toNodeForm(section, node);

  return (
    <>
      {summary.type !== null && summary.type !== name && <ConfigNodeTypeBadge type={summary.type} />}
      {summary.address !== null && <span className='font-mono text-xs text-muted-foreground'>{summary.address}</span>}
      {form.hasForm && !form.recognized && <Badge variant='outline'>{t('rule.uncovered')}</Badge>}
    </>
  );
}
