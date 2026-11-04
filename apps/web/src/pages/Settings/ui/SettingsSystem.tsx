import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SCHEMA_VERSION, useConfigPath, useDaemonStatus } from '@entities/Daemon';
import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';
import { DaemonServiceControl } from '@widgets/Daemon/DaemonService';

import { SettingsSystemRow } from './SettingsSystemRow';

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
            <SettingsSystemRow
              label={t('system.panel')}
              value={status.isPending ? null : (status.data?.version ?? '—')}
            />
            <SettingsSystemRow
              label={t('system.core')}
              value={status.isPending ? null : (status.data?.singboxVersion ?? '—')}
            />
            <SettingsSystemRow label={t('system.schema')} value={SCHEMA_VERSION} />
            <SettingsSystemRow label={t('system.config')} value={configPath} />
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
