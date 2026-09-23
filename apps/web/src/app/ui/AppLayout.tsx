import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ConfigApplyBar } from '@features/Config/ConfigApply';
import { AppSidebar } from '@widgets/AppSidebar';

import { useRuntimeStreams } from '../lib/useRuntimeStreams';
import { DaemonBanner } from './DaemonBanner';

/** Тон primary и позиция поверх макета: ссылка не должна теряться под сайдбаром. */
const SKIP_LINK_CLASS =
  'sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * Оболочка всех экранов. Навигация живёт здесь, а не на странице: она общая для
 * всех маршрутов, и её перемонтирование при переходе сбрасывало бы состояние
 * свёрнутости.
 */
export function AppLayout() {
  useRuntimeStreams();
  const { t } = useTranslation('app');

  return (
    <div className='flex h-full bg-background text-foreground'>
      <a href='#content' className={SKIP_LINK_CLASS}>
        {t('skip.content')}
      </a>
      <AppSidebar />
      <div className='flex min-w-0 grow flex-col'>
        <DaemonBanner />
        <ConfigApplyBar />
        {/* Экран — своя группа View Transitions для перехода роутера; граница
            `<ViewTransition>` вокруг `Outlet` не сработает (ADR-0026). */}
        <main id='content' tabIndex={-1} className='flex min-h-0 grow flex-col [view-transition-name:page]'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
