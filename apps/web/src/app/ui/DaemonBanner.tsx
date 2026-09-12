import { useDaemonStatus } from '@entities/Daemon';
import { API_FAILURE, ApiError } from '@shared/api';

/**
 * Полоса недоступности демона. Живёт в оболочке, потому что это отказ панели
 * целиком, а не одного экрана: дублировать её на каждом экране значит показать
 * пользователю несколько разных сообщений об одной беде (Query.md).
 *
 * «Сервис лежит» сюда не попадает: об остановленном sing-box демон сообщает
 * ответом, и это состояние экрана, а не отказ панели (NFR-1).
 *
 * Непонятый ответ показывается здесь же: пустая панель без сообщения выглядит
 * исправной.
 */
export function DaemonBanner() {
  const status = useDaemonStatus();
  const error = status.error;

  const kind = error instanceof ApiError ? error.kind : null;

  if (kind !== API_FAILURE.Unreachable && kind !== API_FAILURE.Schema) {
    return null;
  }

  return (
    <div role='status' className='shrink-0 bg-destructive/10 px-6 py-2 text-sm text-destructive'>
      {kind === API_FAILURE.Unreachable
        ? 'metabox не отвечает. Панель показывает последние загруженные данные, применять изменения нельзя.'
        : 'Панель не разобрала ответ metabox: версия демона новее панели. Данные на экранах могут быть неполными.'}
    </div>
  );
}
