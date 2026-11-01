import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SCHEMA_VERSION, useConfigPath, useDaemonStatus } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';
import { CARD_TITLE, Card, CardContent, CardHeader, PENDING_REVEAL, Skeleton } from '@shared/ui';
import { DaemonServiceControl } from '@widgets/Daemon/DaemonService';

/**
 * Versions and the service: what is asked about when something breaks after an update.
 * Interception per device stays on the devices screen, where the devices are.
 */
export function SettingsSystem() {
  const { t } = useTranslation('pages/Settings');
  const status = useDaemonStatus();
  const configPath = useConfigPath();

  return (
    <div className='grid items-start gap-4 lg:grid-cols-2'>
      <Card>
        <CardContent>
          <DaemonServiceControl />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className={CARD_TITLE}>{t('system.versions')}</h3>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <dl className='text-sm'>
            <SettingsRow label={t('system.panel')} value={status.isPending ? null : (status.data?.version ?? '—')} />
            <SettingsRow
              label={t('system.core')}
              value={status.isPending ? null : (status.data?.singboxVersion ?? '—')}
            />
            <SettingsRow label={t('system.schema')} value={SCHEMA_VERSION} />
            <SettingsRow label={t('system.config')} value={configPath} />
          </dl>
          <p className='text-sm text-pretty text-muted-foreground'>
            {t('system.devices')}{' '}
            <Link
              to='/devices'
              className='font-medium text-foreground underline underline-offset-3 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
            >
              {t('system.devicesLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** `null` instead of a value means no answer yet: a skeleton, not a dash. */
function SettingsRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-2 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 truncate font-mono text-xs'>
        {value ?? <Skeleton aria-hidden='true' className={cn('h-4 w-24', PENDING_REVEAL)} />}
      </dd>
    </div>
  );
}
