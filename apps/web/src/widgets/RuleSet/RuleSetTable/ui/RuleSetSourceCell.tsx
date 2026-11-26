import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetCellProps } from './RuleSetColumns';
import { formatUpdateInterval } from './RuleSetInterval';

export function RuleSetSourceCell({ set }: RuleSetCellProps) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);
  const { providerName, kind, category } = set.source;

  return (
    <span className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
      <span>{providerName ?? t('ruleSet.ownSource', { ns: SHARED_NS })}</span>
      {kind !== null && (
        <>
          <span aria-hidden='true'>·</span>
          <span className='font-mono'>{kind}</span>
        </>
      )}
      {category !== null && (
        <>
          <span aria-hidden='true'>·</span>
          <span className='font-mono'>{category}</span>
        </>
      )}
      {set.updateInterval !== null && (
        <>
          <span aria-hidden='true'>·</span>
          <span>{t('row.interval', { interval: formatUpdateInterval(set.updateInterval) })}</span>
        </>
      )}
      {set.detour !== null && (
        <>
          <span aria-hidden='true'>·</span>
          <span>{t('row.detour', { detour: set.detour })}</span>
        </>
      )}
    </span>
  );
}
