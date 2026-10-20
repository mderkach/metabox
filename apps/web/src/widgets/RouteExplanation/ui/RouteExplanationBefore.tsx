import { useTranslation } from 'react-i18next';

import type { RouteExplanation as RouteExplanationModel } from '@entities/Route';

/** Rules above the one that hit; without `numbered` their positions are not those of the file. */
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
          <li key={rule.index} className='flex gap-2 font-mono text-xs text-muted-foreground'>
            {numbered && <span className='shrink-0'>{rule.index + 1}</span>}
            <span className='truncate'>
              {rule.conditions.length > 0 ? rule.conditions : t('rule.unconditional', { ns: 'shared' })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
