import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { isNamedRuleMatcher, type RuleMatcher } from '@entities/Rule';

/** How many condition values are shown before folding into "and N more". */
const VISIBLE_VALUES = 2;

function RuleMatcherChipProto({ matcher }: { matcher: RuleMatcher }) {
  const { t } = useTranslation('widgets/Rule/RuleTable');
  const shown = matcher.values.slice(0, VISIBLE_VALUES);
  const hidden = matcher.values.length - shown.length;

  return (
    <span className='inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-muted pr-2 pl-1.5 text-xs'>
      {isNamedRuleMatcher(matcher.key) ? (
        <span className='text-muted-foreground' title={matcher.key}>
          {t(`matcher.${matcher.key}`, { ns: 'shared' })}
        </span>
      ) : (
        <span className='font-mono text-muted-foreground'>{matcher.key}</span>
      )}
      {shown.map((value) => (
        <span key={value} className='font-mono font-medium'>
          {value}
        </span>
      ))}
      {hidden > 0 && (
        <span className='text-muted-foreground'>{t('list.andMore', { ns: 'shared', count: hidden })}</span>
      )}
    </span>
  );
}

export const RuleMatcherChip = memo(RuleMatcherChipProto);
