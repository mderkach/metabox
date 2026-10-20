import { useTranslation } from 'react-i18next';

import { useDaemonStatus, type ServiceStatus } from '@entities/Daemon';
import { AuthLogout } from '@features/Auth/AuthLogout';
import { AuthPassword } from '@features/Auth/AuthPassword';
import { LanguageSwitch } from '@features/Language/LanguageSwitch';
import { ThemeSwitch } from '@features/Theme/ThemeSwitch';
import { cn } from '@shared/lib/utils';

import { useShellServiceStatus } from '../lib/AppSidebar.lib';
import { AppSidebarDrift } from './AppSidebarDrift';
import { SERVICE_LABEL, SERVICE_TONE } from './AppSidebarService';

/**
 * Service state and shell settings: the sidebar footer on a wide screen and
 * the "More" sheet of the bottom bar on a phone. Returns a fragment — the layout is set by the
 * container.
 */
export function AppSidebarControls({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const status = useDaemonStatus();
  const service = useShellServiceStatus();

  return (
    <>
      <ServiceDot status={service} collapsed={collapsed} />

      <AppSidebarDrift collapsed={collapsed} />

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

      <div className={cn('flex flex-col gap-0.5 empty:hidden', collapsed && 'items-center')}>
        <AuthPassword collapsed={collapsed} />
        <AuthLogout collapsed={collapsed} />
      </div>
    </>
  );
}

/**
 * Service state in the shell, not only on the Overview: it is visible without going
 * to a separate screen.
 */
function ServiceDot({ status, collapsed }: { status: ServiceStatus | null; collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const label = t(status === null ? 'service.unknown' : SERVICE_LABEL[status]);
  const tone = status === null ? 'bg-signal-idle' : SERVICE_TONE[status];

  return (
    <p title={label} className='flex items-center gap-2 text-xs text-muted-foreground'>
      <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', tone)} />
      {!collapsed && <span className='truncate'>{label}</span>}
      {collapsed && <span className='sr-only'>{label}</span>}
    </p>
  );
}
