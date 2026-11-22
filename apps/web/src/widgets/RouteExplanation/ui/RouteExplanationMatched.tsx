import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';

import { toActionText, toRuleText } from '@entities/Connection';
import { ROUTE_MATCH, type RouteExplanation as RouteExplanationModel, type RuleEditorSearch } from '@entities/Route';
import { isNamedRuleAction, isNamedRuleMatcher } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { buttonVariants } from '@shared/ui';

import { unknownReason } from '../lib/RouteExplanation.reason';
import { RouteExplanationRow } from './RouteExplanationRow';
import { RouteExplanationUnknown } from './RouteExplanationUnknown';
import { RouteOriginBadge } from './RouteOriginBadge';

export function RouteExplanationMatched({
  explanation,
  appliedIndex,
  ruleName,
  editorSearch,
}: {
  explanation: RouteExplanationModel;
  appliedIndex: number | null;
  ruleName: string | null;
  editorSearch: RuleEditorSearch;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const { match } = explanation;

  if (match.kind === ROUTE_MATCH.Final) {
    return (
      <section className='flex flex-col gap-1.5'>
        <div className='flex items-center gap-2'>
          <h3 className='text-sm font-medium'>{t('final.title')}</h3>
          <RouteOriginBadge origin={match.origin} />
        </div>
        <p className='text-sm text-muted-foreground'>
          <Trans t={t} i18nKey='final.description' components={{ code: <code className='font-mono' /> }} />
        </p>
      </section>
    );
  }

  if (match.kind === ROUTE_MATCH.Unknown) {
    return <RouteExplanationUnknown reason={unknownReason(t, match)} />;
  }

  const conditions =
    match.conditions.length > 0
      ? toRuleText(match.conditions, (key) => (isNamedRuleMatcher(key) ? t(`matcher.${key}`, { ns: 'shared' }) : null))
      : t('rule.unconditional', { ns: 'shared' });
  const action = toActionText(
    match.action,
    (outbound) => t('route.via', { ns: 'shared', outbound }),
    (name) => (isNamedRuleAction(name) ? t(`ruleAction.${name}`, { ns: 'shared' }) : null)
  );

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>
          {appliedIndex === null ? t('matched.observed') : t('matched.title', { number: appliedIndex + 1 })}
        </h3>
        <RouteOriginBadge origin={match.origin} />
      </div>

      <dl className='text-sm'>
        {ruleName !== null && <RouteExplanationRow label={t('matched.name')} value={ruleName} raw={ruleName} />}
        <RouteExplanationRow label={t('rule.conditions', { ns: 'shared' })} value={conditions} raw={match.conditions} />
        <RouteExplanationRow label={t('matched.action')} value={action} raw={match.action} />
      </dl>

      {editorSearch.rule !== undefined && (
        <Link
          to='/config'
          search={editorSearch}
          // Styled as a button but stays a link: `Button` with `render` puts
          // `role="button"` on top of `<a href>` even with `nativeButton={false}`.
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          {t('matched.open')}
        </Link>
      )}
    </section>
  );
}
