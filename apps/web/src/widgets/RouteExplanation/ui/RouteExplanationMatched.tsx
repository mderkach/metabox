import { Link } from '@tanstack/react-router';
import type { ParseKeys, TFunction } from 'i18next';
import { Trans, useTranslation } from 'react-i18next';

import { toActionText, toRuleText } from '@entities/Connection';
import {
  ROUTE_MATCH,
  type RouteExplanation as RouteExplanationModel,
  type RouteMatch,
  type RouteReasonCode,
} from '@entities/Route';
import { isNamedRuleAction, isNamedRuleMatcher } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { buttonVariants } from '@shared/ui';

import { RouteExplanationRow } from './RouteExplanationRow';
import { RouteExplanationUnknown } from './RouteExplanationUnknown';
import { RouteOriginBadge } from './RouteOriginBadge';

/** The table must cover the daemon's set: a new code is a compile error here. */
const REASON_KEY: Readonly<Record<RouteReasonCode, ParseKeys<'widgets/RouteExplanation'>>> = {
  not_in_process_list: 'unknown.reason.not_in_process_list',
};

/**
 * The rule sing-box reported. On a config drift its number would point to
 * another rule of the file, so the rule is shown by its conditions alone and
 * nothing leads into the editor.
 */
export function RouteExplanationMatched({
  explanation,
  trusted,
  drifted,
}: {
  explanation: RouteExplanationModel;
  trusted: boolean;
  drifted: boolean;
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

  if (match.kind === ROUTE_MATCH.Unknown || match.index === null) {
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
          {drifted ? t('matched.observed') : t('matched.title', { number: match.index + 1 })}
        </h3>
        <RouteOriginBadge origin={match.origin} />
      </div>

      <dl className='text-sm'>
        <RouteExplanationRow label={t('rule.conditions', { ns: 'shared' })} value={conditions} raw={match.conditions} />
        <RouteExplanationRow label={t('matched.action')} value={action} raw={match.action} />
      </dl>

      {drifted && <p className='text-xs text-pretty text-muted-foreground'>{t('matched.unmapped')}</p>}

      {trusted && (
        <Link
          to='/config'
          search={{ rule: match.index + 1 }}
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

/** Text from the response is used only for an unfamiliar code: it is in the daemon's language. */
function unknownReason(t: TFunction<'widgets/RouteExplanation'>, match: RouteMatch): string {
  if (match.reasonCode !== null) {
    return t(REASON_KEY[match.reasonCode]);
  }

  return match.reason.length > 0 ? match.reason : t('unknown.missing');
}
