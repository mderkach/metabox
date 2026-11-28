import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OverviewOutbound } from '../model/Overview.outbounds';

export function OverviewOutboundRules({
  row,
  quiet,
}: {
  row: Pick<OverviewOutbound, 'final' | 'rules' | 'ruleCount'>;
  quiet: boolean;
}) {
  const { t } = useTranslation(OVERVIEW_NS);
  const more = row.ruleCount - row.rules.length;

  return (
    <div role='cell' className='col-span-full min-w-0 space-y-1 lg:col-span-1'>
      {row.final ? (
        <>
          <p className='text-sm font-medium'>{t('outbounds.final')}</p>
          <p className='text-xs text-muted-foreground'>{t('outbounds.defaultRule')}</p>
        </>
      ) : (
        <>
          <ul className='flex flex-wrap items-baseline gap-1'>
            {row.rules.map(({ id, caption, named }) => (
              <li
                key={id}
                title={caption}
                className={cn(
                  'max-w-full min-w-0 truncate rounded-xl bg-muted px-2 py-0.5 text-xs',
                  !named && 'font-mono',
                  (!named || quiet) && 'text-muted-foreground'
                )}
              >
                {caption}
              </li>
            ))}
            {more > 0 && (
              <li className='self-center px-1 text-xs text-muted-foreground'>
                {t('list.andMore', { ns: SHARED_NS, count: more })}
              </li>
            )}
          </ul>
          <p className='text-xs font-medium text-muted-foreground'>
            {t('outbounds.ruleCount', { count: row.ruleCount })}
          </p>
        </>
      )}
    </div>
  );
}
