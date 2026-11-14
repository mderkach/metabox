import { useTranslation } from 'react-i18next';

import type { SessionWire } from '@entities/Auth';
import { formatAge } from '@shared/lib/format';
import { SECONDS_IN_MINUTE } from '@shared/lib/time';
import { Badge, Button, DESTRUCTIVE_OUTLINE } from '@shared/ui';

/** One session: the address it signed in from, when, and its last request. */
export function AuthSessionsRow({
  session,
  ending,
  onEnd,
}: {
  session: SessionWire;
  ending: boolean;
  onEnd: () => void;
}) {
  const { t } = useTranslation('features/Auth/AuthSessions');
  const age = formatAge(session.age_seconds);
  const activity =
    session.idle_seconds < SECONDS_IN_MINUTE
      ? t('activityNow', { age })
      : t('activity', { age, idle: formatAge(session.idle_seconds) });

  return (
    <li className='flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0'>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <div className='flex flex-wrap items-center gap-2'>
          {session.addr === undefined ? (
            <span className='text-sm text-muted-foreground'>{t('unknownAddress')}</span>
          ) : (
            <span className='font-mono text-sm break-all'>{session.addr}</span>
          )}
          {session.current && <Badge variant='secondary'>{t('current')}</Badge>}
        </div>
        <p className='text-xs text-muted-foreground'>{activity}</p>
      </div>
      {!session.current && (
        <Button
          variant='outline'
          size='sm'
          className={DESTRUCTIVE_OUTLINE}
          aria-label={t('endNamed', { name: session.addr ?? t('unknownAddress') })}
          disabled={ending}
          onClick={onEnd}
        >
          {t('end')}
        </Button>
      )}
    </li>
  );
}
