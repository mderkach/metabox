import { Link } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import { CircleCheck, CircleMinus, CircleX, Stethoscope, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { DIAG_STATUS, toDiagAreas, type CheckStatus, type DiagArea } from '@entities/Diag';
import { toOutboundTargets, useProxies } from '@entities/Proxy';
import { useDiagRun } from '@features/Diag/DiagRun';
import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { Button, CARD_TITLE, QueryFailure, Skeleton } from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OverviewLinks } from '../model/Overview.links';

const AREA_KEY: Readonly<Record<DiagArea, ParseKeys<typeof OVERVIEW_NS>>> = {
  interception: 'check.area.interception',
  dns: 'check.area.dns',
  proxy: 'check.area.proxy',
  direct: 'check.area.direct',
};

/** The result carries two signs, an icon and a color: one of them is not color-based. */
const STATUS_VIEW: Readonly<
  Record<CheckStatus, { icon: LucideIcon; tone: string; label: ParseKeys<typeof OVERVIEW_NS> }>
> = {
  ok: { icon: CircleCheck, tone: 'text-signal-ok', label: 'check.status.ok' },
  fail: { icon: CircleX, tone: 'text-signal-bad', label: 'check.status.fail' },
  skipped: { icon: CircleMinus, tone: 'text-signal-idle', label: 'check.status.skipped' },
};

/**
 * The diagnostics run folded into four areas. It starts only on the button, like on
 * the diagnostics screen: a check sends packets from the router and leaves lines in
 * the sing-box log. The target is the same default one as there.
 */
export function OverviewCheck({
  diagnosticsTo,
  onChecked,
}: {
  diagnosticsTo: OverviewLinks['diagnostics'];
  onChecked: (message: string) => void;
}) {
  const { t } = useTranslation(OVERVIEW_NS);
  const proxies = useProxies();
  const target = toOutboundTargets(proxies.data).at(0) ?? '';
  const { report, start, started } = useDiagRun();
  const areas = report.data === undefined ? [] : toDiagAreas(report.data);
  const failed = areas.some((area) => area.status === DIAG_STATUS.Fail);
  const checkedAt = report.isSuccess ? report.dataUpdatedAt : null;

  // The areas change in place: a screen reader hears the outcome once per run.
  useEffect(
    function announceCheck() {
      if (checkedAt !== null) {
        onChecked(t(failed ? 'check.announce.fail' : 'check.announce.ok'));
      }
    },
    [checkedAt, failed, onChecked, t]
  );

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <div className='flex min-w-0 grow flex-col gap-0.5'>
          <h2 className={CARD_TITLE}>{t('check.title')}</h2>
          {target !== '' && <p className='truncate text-xs text-muted-foreground'>{t('check.target', { target })}</p>}
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={report.isFetching || proxies.isPending}
          onClick={() => {
            start(target);
          }}
        >
          <Stethoscope data-icon='inline-start' />
          {report.isFetching ? t('check.pending') : t('check.action')}
        </Button>
      </div>

      {!started && <p className='text-xs text-pretty text-muted-foreground'>{t('check.hint')}</p>}

      {started && report.isPending && (
        <div aria-hidden='true' className='flex flex-wrap gap-x-4 gap-y-2'>
          {Object.keys(AREA_KEY).map((area) => (
            <Skeleton key={area} className='h-5 w-24' />
          ))}
        </div>
      )}

      {report.isLoadingError && <QueryFailure messageKey='source.diag' query={report} />}

      {areas.length > 0 && (
        <ul aria-label={t('check.label')} className='flex flex-wrap gap-x-4 gap-y-2'>
          {areas.map((area) => {
            const view = STATUS_VIEW[area.status];

            return (
              <li key={area.area} className='flex items-center gap-1.5 text-sm whitespace-nowrap'>
                <view.icon aria-hidden='true' className={cn('size-4 shrink-0', view.tone)} />
                <span>{t(AREA_KEY[area.area])}</span>
                <span className='sr-only'>{t(view.label)}</span>
                {area.delayMs !== null && (
                  <span className='font-mono text-xs text-muted-foreground tabular-nums'>
                    {t('delay.value', { ns: SHARED_NS, value: area.delayMs })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {failed && (
        <Link
          to={diagnosticsTo}
          className='w-fit text-sm font-medium underline underline-offset-3 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
        >
          {t('check.details')}
        </Link>
      )}
    </div>
  );
}
