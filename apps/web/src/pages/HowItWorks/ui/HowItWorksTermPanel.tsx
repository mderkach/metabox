import { useTranslation } from 'react-i18next';

import type { RuleEditorSearch } from '@entities/Route';

import { HOW_IT_WORKS_NS } from '../i18n/HowItWorks.namespace.generated';
import type { HowItWorksTermLinks } from '../model/HowItWorks.links';
import type { WalkTerm } from '../model/HowItWorks.terms';
import { HowItWorksTermLink } from './HowItWorksTermLink';

export function HowItWorksTermPanel({
  links,
  term,
  ruleSearch,
  ruleSetTag,
  groupExample,
}: {
  links: HowItWorksTermLinks;
  term: WalkTerm;
  ruleSearch?: RuleEditorSearch;
  ruleSetTag?: string;
  groupExample: boolean;
}) {
  const { t } = useTranslation(HOW_IT_WORKS_NS);

  return (
    <section className='grid gap-2 rounded-lg border bg-card p-4'>
      <h2 className='text-base font-semibold'>{t(`terms.${term}.title`)}</h2>
      <p className='max-w-prose text-sm'>{t(`terms.${term}.description`)}</p>
      {term === 'outbound' && groupExample && (
        <p className='max-w-prose text-sm text-muted-foreground'>{t('terms.groupExample')}</p>
      )}
      <div>
        <HowItWorksTermLink links={links} term={term} ruleSearch={ruleSearch} ruleSetTag={ruleSetTag} />
      </div>
    </section>
  );
}
