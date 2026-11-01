import { useTranslation } from 'react-i18next';

import { toRuleText } from '@entities/Connection';
import type { RouteExplanation as RouteExplanationModel } from '@entities/Route';
import { isNamedRuleMatcher } from '@entities/Rule';

/**
 * Rules above the one that hit; without `numbered` their positions are not those of the file.
 * Conditions read in the same words as the matched rule and the rule table; the
 * sing-box notation stays in the tooltip.
 */
export function RouteExplanationBefore({
  rules,
  numbered,
}: {
  rules: RouteExplanationModel['rules'];
  numbered: boolean;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');

  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className='text-sm font-medium'>{t('before.title')}</h3>
      <ul aria-label={t('before.label')} className='flex flex-col gap-1'>
        {rules.map((rule) => (
          <li key={rule.index} className='flex gap-2 text-xs text-muted-foreground'>
            {numbered && <span className='w-5 shrink-0 text-right font-mono tabular-nums'>{rule.index + 1}</span>}
            <span className='truncate' title={rule.conditions.length > 0 ? rule.conditions : undefined}>
              {rule.conditions.length > 0
                ? toRuleText(rule.conditions, (key) =>
                    isNamedRuleMatcher(key) ? t(`matcher.${key}`, { ns: 'shared' }) : null
                  )
                : t('rule.unconditional', { ns: 'shared' })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
