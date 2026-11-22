import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { WALK_TERMS, type WalkTerm } from '../model/HowItWorks.terms';
import { HowItWorksTermPanel } from './HowItWorksTermPanel';

export function HowItWorksTerms({
  selected,
  onSelect,
  inline,
  ruleNumber,
  ruleSetTag,
  groupExample,
}: {
  selected: WalkTerm;
  onSelect: (term: WalkTerm) => void;
  inline: boolean;
  ruleNumber?: number;
  ruleSetTag?: string;
  groupExample: boolean;
}) {
  const { t } = useTranslation('pages/HowItWorks');

  return (
    <section className='grid gap-3'>
      <h2 className='text-base font-semibold'>{t('terms.heading')}</h2>
      <ul className='grid gap-2 md:grid-cols-3'>
        {WALK_TERMS.map((term) => (
          <li key={term} className={cn('min-w-0', inline && selected === term && 'grid gap-2')}>
            <button
              type='button'
              aria-pressed={selected === term}
              className={cn(
                'grid size-full gap-1 rounded-lg border p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                selected === term ? 'border-selected-edge bg-selected' : 'border-border bg-card hover:bg-muted'
              )}
              onClick={() => {
                onSelect(term);
              }}
            >
              <span className='text-sm font-semibold'>{t(`terms.${term}.title`)}</span>
              <span className='text-sm text-muted-foreground'>{t(`terms.${term}.description`)}</span>
            </button>
            {inline && selected === term && (
              <HowItWorksTermPanel
                term={term}
                ruleNumber={ruleNumber}
                ruleSetTag={ruleSetTag}
                groupExample={groupExample}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
