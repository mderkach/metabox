import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@shared/ui';

import { RULE_HIT, type RuleHitCell } from '../model';

export function RuleHitValue({ hits, language }: { hits: RuleHitCell; language: string }) {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  if (hits === RULE_HIT.Edited) {
    return <span aria-hidden='true'>—</span>;
  }

  if (hits === RULE_HIT.Unobserved) {
    return (
      <Popover>
        {/* `relative` lifts the trigger above the select button that covers the row. */}
        <PopoverTrigger
          type='button'
          aria-label={t('hits.unobserved')}
          className='relative rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:min-w-11'
        >
          {t('hits.unobservedCell')}
        </PopoverTrigger>
        <PopoverContent className='w-auto max-w-xs'>{t('hits.unobserved')}</PopoverContent>
      </Popover>
    );
  }

  return <data value={hits}>{hits.toLocaleString(language)}</data>;
}
