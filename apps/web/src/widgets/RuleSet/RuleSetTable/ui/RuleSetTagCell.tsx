import { useTranslation } from 'react-i18next';

import { RULE_SET_TYPE } from '@entities/RuleSet';
import { SHARED_NS } from '@shared/i18n';
import { Badge } from '@shared/ui';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetCellProps } from './RuleSetColumns';

export function RuleSetTagCell({ set }: RuleSetCellProps) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);

  return (
    <>
      <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <span className='font-mono text-sm break-all'>{set.tag === '' ? t('row.untagged') : set.tag}</span>

        {set.type !== RULE_SET_TYPE.Remote && <Badge variant='secondary'>{t(`type.${set.type}`)}</Badge>}

        {!set.recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: SHARED_NS })}</Badge>}
      </span>

      {set.location !== '' && (
        <span className='truncate font-mono text-xs text-muted-foreground' title={set.location}>
          {set.location}
        </span>
      )}
    </>
  );
}
