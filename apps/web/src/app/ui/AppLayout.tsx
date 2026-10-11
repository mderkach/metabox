import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfigLeaveGuard } from '@entities/Config';
import { ConfigApplyBar } from '@features/Config/ConfigApply';
import { useNarrowScreen } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import { AppSidebar, AppSidebarBottomNav } from '@widgets/AppSidebar';

import { useRuntimeStreams } from '../lib/useRuntimeStreams';
import { DaemonBanner } from './DaemonBanner';

/** Тон primary и позиция поверх макета: ссылка не должна теряться под сайдбаром. */
const SKIP_LINK_CLASS =
  'sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * Оболочка всех экранов. Навигация живёт здесь, а не на странице: она общая для
 * всех маршрутов, и её перемонтирование при переходе сбрасывало бы состояние
 * свёрнутости. На узком экране боковую панель сменяет нижняя: содержимое
 * получает всю ширину.
 */
export function AppLayout() {
  useRuntimeStreams();
  useConfigLeaveGuard();
  const { t } = useTranslation('app');
  const narrow = useNarrowScreen();
  const [applySpace, setApplySpace] = useState(0);

  return (
    // `viewport-fit=cover` отдаёт панели весь экран, вместе с вырезами по бокам
    // в альбомной ориентации: отступы держат содержимое вне них.
    <div
      className={cn(
        'flex h-full bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-foreground',
        narrow && 'flex-col'
      )}
    >
      <a href='#content' className={SKIP_LINK_CLASS}>
        {t('skip.content')}
      </a>
      {!narrow && <AppSidebar />}
      <div className='flex min-h-0 min-w-0 grow flex-col'>
        <DaemonBanner />
        <div className='relative flex min-h-0 grow flex-col'>
          {/* Экран — своя группа View Transitions для перехода роутера; граница
              `<ViewTransition>` вокруг `Outlet` не сработает. Отступ снизу — место
              под плавающим баром применения: без него бар закрыл бы низ экрана. */}
          <main
            id='content'
            tabIndex={-1}
            style={{ paddingBottom: applySpace }}
            className='flex min-h-0 grow flex-col [view-transition-name:page]'
          >
            <Outlet />
          </main>
          <ConfigApplyBar onSpaceChange={setApplySpace} />
        </div>
      </div>
      {narrow && <AppSidebarBottomNav />}
    </div>
  );
}
