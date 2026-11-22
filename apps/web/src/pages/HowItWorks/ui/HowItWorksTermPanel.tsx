import { useTranslation } from 'react-i18next';

import type { WalkTerm } from '../model/HowItWorks.terms';
import { HowItWorksTermLink } from './HowItWorksTermLink';

export function HowItWorksTermPanel({
  term,
  ruleNumber,
  ruleSetTag,
  groupExample,
}: {
  term: WalkTerm;
  ruleNumber?: number;
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
        <HowItWorksTermLink term={term} ruleNumber={ruleNumber} ruleSetTag={ruleSetTag} />
      </div>
    </section>
  );
}
