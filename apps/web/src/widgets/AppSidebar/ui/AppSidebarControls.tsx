import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import {
  SERVICE_STATUS,
  useDaemonReachable,
  useDaemonStatus,
  useServiceState,
  type ServiceStatus,
} from '@entities/Daemon';
import { DaemonModeSwitch } from '@features/Daemon/DaemonMode';
import { LanguageSwitch } from '@features/Language/LanguageSwitch';
import { ThemeSwitch } from '@features/Theme/ThemeSwitch';
import { cn } from '@shared/lib/utils';

const STATUS_TONE: Readonly<Record<ServiceStatus, string>> = {
  [SERVICE_STATUS.Running]: 'bg-signal-ok',
  [SERVICE_STATUS.Stopped]: 'bg-signal-idle',
  [SERVICE_STATUS.Failed]: 'bg-signal-bad',
};

const STATUS_LABEL = {
  [SERVICE_STATUS.Running]: 'service.running',
  [SERVICE_STATUS.Stopped]: 'service.stopped',
  [SERVICE_STATUS.Failed]: 'service.failed',
} as const satisfies Readonly<Record<ServiceStatus, ParseKeys<'widgets/AppSidebar'>>>;

/**
 * Состояние службы и настройки оболочки: подвал сайдбара на широком экране и
 * лист «Ещё» нижней панели на телефоне. Отдаёт фрагмент — раскладку задаёт
 * контейнер.
 */
export function AppSidebarControls({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const status = useDaemonStatus();
  const reachable = useDaemonReachable();
  const service = useServiceState();

  return (
    <>
      <ServiceDot status={reachable ? (service.data?.status ?? null) : null} collapsed={collapsed} />

      <DaemonModeSwitch compact={collapsed} />

      {!collapsed && (
        <dl className='flex items-baseline justify-between gap-2 text-xs'>
          <dt className='text-muted-foreground'>{t('daemon.name', { ns: 'shared' })}</dt>
          <dd className='truncate font-mono text-muted-foreground'>
            {status.isSuccess ? status.data.version : t('daemon.silent')}
          </dd>
        </dl>
      )}

      <div className={cn('flex gap-1.5', collapsed && 'flex-col')}>
        <ThemeSwitch vertical={collapsed} />
        <LanguageSwitch vertical={collapsed} />
      </div>
    </>
  );
}

/**
 * Состояние сервиса в оболочке, а не только на «Обзоре»: его видно без перехода
 * на отдельный экран.
 */
function ServiceDot({ status, collapsed }: { status: ServiceStatus | null; collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const label = t(status === null ? 'service.unknown' : STATUS_LABEL[status]);
  const tone = status === null ? 'bg-signal-idle' : STATUS_TONE[status];

  return (
    <p title={label} className='flex items-center gap-2 text-xs text-muted-foreground'>
      <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', tone)} />
      {!collapsed && <span className='truncate'>{label}</span>}
      {collapsed && <span className='sr-only'>{label}</span>}
    </p>
  );
}
