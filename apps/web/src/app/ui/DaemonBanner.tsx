import { CircleAlert, Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useDaemonReachable, useDaemonStatus } from '@entities/Daemon';
import { API_FAILURE, ApiError } from '@shared/api';

/**
 * Полоса недоступности демона. Живёт в оболочке, потому что отказ касается всех
 * экранов, а не одного: дублировать её на каждом экране значит показать
 * пользователю несколько разных сообщений об одной беде (Query.md). Стоит она
 * в колонке содержимого над баром применения, а не над всей панелью: сайдбар
 * без демона работает — навигация, тема и язык от него не зависят.
 *
 * «Сервис лежит» сюда не попадает: об остановленном sing-box демон сообщает
 * ответом, и это состояние экрана, а не отказ панели.
 *
 * Непонятый ответ показывается здесь же: пустая панель без сообщения выглядит
 * исправной.
 */
export function DaemonBanner() {
  const { t } = useTranslation('app');
  const status = useDaemonStatus();
  const reachable = useDaemonReachable();

  if (reachable) {
    return null;
  }

  const unreachable = status.error instanceof ApiError && status.error.kind === API_FAILURE.Unreachable;

  return (
    <div role='status' className='shrink-0 border-b border-destructive/20 bg-destructive/10 px-4 py-2.5 sm:px-6'>
      <div className='flex min-h-7 items-center gap-2.5 text-sm text-destructive'>
        {unreachable ? <Unplug className='size-4 shrink-0' /> : <CircleAlert className='size-4 shrink-0' />}
        <p>{unreachable ? t('banner.unreachable') : t('banner.schema')}</p>
      </div>
    </div>
  );
}
