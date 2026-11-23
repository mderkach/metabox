import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { isNamedRuleAction, RULE_TARGET, useRuleTitle, type RuleRow } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { Card, CardContent } from '@shared/ui';

import { SimpleRoutesSection } from './SimpleRoutesSection';

export function SimpleRoutesRules({ rules, outbound }: { rules: readonly RuleRow[]; outbound?: string }) {
  const { t } = useTranslation('pages/SimpleRoutes');
  const { t: tShared } = useTranslation('shared');
  const { subject } = useRuleTitle();
  const shown =
    outbound === undefined
      ? rules
      : rules.filter((rule) => rule.targetKind === RULE_TARGET.Outbound && rule.target === outbound);

  return (
    <SimpleRoutesSection title={t('sections.rules')}>
      {outbound !== undefined && (
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm wrap-anywhere'>
          <p>{t('rules.filtered', { outbound })}</p>
          <Link
            to='/config/simple'
            search={{ outbound: undefined }}
            className='text-primary underline underline-offset-4'
          >
            {t('rules.clear')}
          </Link>
        </div>
      )}
      <Card size='sm'>
        <CardContent>
          {shown.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t(outbound === undefined ? 'rules.empty' : 'rules.noMatches')}
            </p>
          ) : (
            <ol className='divide-y divide-border'>
              {shown.map((rule) => (
                <li key={rule.id} value={rule.index} className='flex items-baseline gap-2 py-2 text-sm wrap-anywhere'>
                  <span className='shrink-0 text-muted-foreground tabular-nums'>{rule.index}.</span>
                  <span className='min-w-0 grow'>{subject(rule)}</span>
                  <span
                    className={cn(
                      'min-w-0 text-right text-muted-foreground',
                      rule.targetKind === RULE_TARGET.Outbound && 'font-mono'
                    )}
                  >
                    {rule.targetKind === RULE_TARGET.Action && isNamedRuleAction(rule.target)
                      ? tShared(`ruleAction.${rule.target}`)
                      : rule.target || t('rules.targetUnknown')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </SimpleRoutesSection>
  );
}
