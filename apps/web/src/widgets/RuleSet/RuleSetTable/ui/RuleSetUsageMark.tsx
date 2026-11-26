import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetLinks } from '../model/RuleSetTable.links';
import { RuleSetUsageValue } from './RuleSetUsageValue';

export function RuleSetUsageMark({
  tag,
  usedBy,
  byTag,
}: {
  tag: string;
  usedBy: number;
  byTag: RuleSetLinks['byTag'];
}) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);

  if (tag === '') {
    return <RuleSetUsageValue usedBy={usedBy} />;
  }

  return (
    <Link
      {...byTag(tag)}
      title={t('row.rules', { tag })}
      className='rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
    >
      <RuleSetUsageValue usedBy={usedBy} />
    </Link>
  );
}
