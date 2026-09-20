import { useTranslation } from 'react-i18next';

import { useDaemonReachable, useDaemonStatus } from '@entities/Daemon';
import { API_FAILURE, ApiError } from '@shared/api';

/**
 * Полоса недоступности демона. Живёт в оболочке, потому что это отказ панели
 * целиком, а не одного экрана: дублировать её на каждом экране значит показать
 * пользователю несколько разных сообщений об одной беде (Query.md).
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

  const kind = status.error instanceof ApiError ? status.error.kind : null;

  return (
    <div role='status' className='shrink-0 bg-destructive/10 px-6 py-2 text-sm text-destructive'>
      {kind === API_FAILURE.Unreachable ? t('banner.unreachable') : t('banner.schema')}
    </div>
  );
}
