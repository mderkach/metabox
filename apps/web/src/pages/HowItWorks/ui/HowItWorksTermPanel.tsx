import { useTranslation } from 'react-i18next';

import type { RuleEditorSearch } from '@entities/Route';

import type { WalkTerm } from '../model/HowItWorks.terms';
import { HowItWorksTermLink } from './HowItWorksTermLink';

export function HowItWorksTermPanel({
  term,
  ruleSearch,
  ruleSetTag,
  groupExample,
}: {
  term: WalkTerm;
  ruleSearch?: RuleEditorSearch;
  ruleSetTag?: string;
  groupExample: boolean;
}) {
  const { t } = useTranslation('pages/HowItWorks');

  return (
    <section className='grid gap-2 rounded-lg border bg-card p-4'>
      <h2 className='text-base font-semibold'>{t(`terms.${term}.title`)}</h2>
      <p className='max-w-prose text-sm'>{t(`terms.${term}.description`)}</p>
      {term === 'outbound' && groupExample && (
        <p className='max-w-prose text-sm text-muted-foreground'>{t('terms.groupExample')}</p>
      )}
      <div>
        <HowItWorksTermLink term={term} ruleSearch={ruleSearch} ruleSetTag={ruleSetTag} />
      </div>
    </section>
  );
}
