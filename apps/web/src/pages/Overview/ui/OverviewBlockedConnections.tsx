import { Trans, useTranslation } from 'react-i18next';

import type { SystemStat } from '@entities/Daemon';
import { Badge } from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { OverviewTrafficHelp } from './OverviewTrafficHelp';

export function OverviewBlockedConnections({ blocked }: { blocked: SystemStat['blocked'] }) {
  const { t, i18n } = useTranslation(OVERVIEW_NS);
  const count = blocked?.incomplete === true ? undefined : blocked?.count;

  return (
    <dl className='flex flex-wrap items-baseline gap-x-2 text-sm'>
      <dt className='text-muted-foreground'>{t('traffic.blocked.label')}</dt>
      <dd className='flex min-w-0 flex-wrap items-center gap-x-1'>
        {count === undefined ? (
          <>
            <span>{t('traffic.blocked.unavailable')}</span>
            <OverviewTrafficHelp label={t('traffic.blocked.unavailableLabel')}>
              {blocked?.incomplete === true && <span>{t('traffic.blocked.incomplete')} </span>}
              <Trans t={t} i18nKey='traffic.blocked.levelHelp' components={{ code: <code className='font-mono' /> }} />
            </OverviewTrafficHelp>
          </>
        ) : (
          <>
            <data value={count} className='font-mono font-medium tabular-nums'>
              {count.toLocaleString(i18n.language)}
            </data>
            <OverviewTrafficHelp
              label={t('traffic.blocked.computed')}
              mark={
                <Badge variant='outline' className='h-auto min-h-5 max-w-full wrap-anywhere whitespace-normal'>
                  {t('traffic.blocked.computed')}
                </Badge>
              }
            >
              {t('traffic.blocked.computedHelp')}
            </OverviewTrafficHelp>
          </>
        )}
      </dd>
    </dl>
  );
}
