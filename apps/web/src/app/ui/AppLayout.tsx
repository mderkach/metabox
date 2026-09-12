import { Outlet } from '@tanstack/react-router';

import { ConfigApplyBar } from '@features/Config/ConfigApply';
import { AppSidebar } from '@widgets/AppSidebar';

import { useRuntimeStreams } from '../lib/useRuntimeStreams';

/**
 * Оболочка всех экранов. Навигация живёт здесь, а не на странице: она общая для
 * всех маршрутов, и её перемонтирование при переходе сбрасывало бы состояние
 * свёрнутости.
 */
export function AppLayout() {
  useRuntimeStreams();

  return (
    <div className='flex h-full bg-background text-foreground'>
      <AppSidebar />
      <div className='flex min-w-0 grow flex-col'>
        <ConfigApplyBar />
        <Outlet />
      </div>
    </div>
  );
}
