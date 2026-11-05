import { useTranslation } from 'react-i18next';

import { useDaemonStatus } from '@entities/Daemon';
import { AuthLogout } from '@features/Auth/AuthLogout';
import { LanguageSwitch } from '@features/Language/LanguageSwitch';
import { ThemeSwitch } from '@features/Theme/ThemeSwitch';
import { cn } from '@shared/lib/utils';

import { useShellServiceStatus } from '../lib/AppSidebar.lib';
import { AppSidebarDrift } from './AppSidebarDrift';
import { AppSidebarServiceDot } from './AppSidebarServiceDot';

/**
 * Service state, theme, language and logout: the sidebar footer on a wide screen and
 * the "More" sheet of the bottom bar on a phone. Returns a fragment — the layout is set by the
 * container.
 */
export function AppSidebarControls({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const status = useDaemonStatus();
  const service = useShellServiceStatus();

  return (
    <>
      <AppSidebarServiceDot status={service} collapsed={collapsed} />

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
        <AuthLogout collapsed={collapsed} />
      </div>
    </>
  );
}
