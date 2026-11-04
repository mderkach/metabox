import { useTranslation } from 'react-i18next';

import { isNamedRuleMatcher, type RuleRow } from '@entities/Rule';
import { CARD_TITLE } from '@shared/ui';

import { RulePanelBreakText } from './RulePanelBreakText';

export function RulePanelConditions({ rule }: { rule: RuleRow }) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  // An unrecognized node is never "without conditions": there is a condition in it, it is just that
  // the schema does not know its fields, and there is no way to show it as a form.
  if (rule.isCatchAll && !rule.recognized) {
    return <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>{t('conditions.unknown')}</p>;
  }

  if (rule.isCatchAll) {
    return <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>{t('conditions.empty')}</p>;
  }

  if (rule.group !== null) {
    return (
      <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
        {t('conditions.group', { mode: rule.group.mode })}
      </p>
    );
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className={CARD_TITLE}>{t('rule.conditions', { ns: 'shared' })}</h3>
      <dl className='flex flex-col gap-1'>
        {rule.matchers.map((matcher) => (
          <div key={matcher.key} className='flex gap-3 border-t border-border py-1.5 text-xs first:border-t-0'>
            {isNamedRuleMatcher(matcher.key) ? (
              <dt className='w-32 shrink-0 wrap-anywhere text-muted-foreground' title={matcher.key}>
                {t(`matcher.${matcher.key}`, { ns: 'shared' })}
              </dt>
            ) : (
              <dt className='w-32 shrink-0 font-mono wrap-anywhere text-muted-foreground'>
                <RulePanelBreakText text={matcher.key} />
              </dt>
            )}
            <dd className='min-w-0 grow font-mono wrap-anywhere'>
              <ul>
                {matcher.values.map((value, index) => (
                  <li key={index} className='inline'>
                    <RulePanelBreakText text={value} />
                    {index < matcher.values.length - 1 && ', '}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      {rule.invert && <p className='text-xs text-muted-foreground'>{t('conditions.inverted')}</p>}
    </section>
  );
}
