import { useDaemonStatus } from "@entities/Daemon"
import { API_FAILURE, ApiError } from "@shared/api"

/**
 * Полоса недоступности демона. Живёт в оболочке, потому что это отказ панели
 * целиком, а не одного экрана: дублировать её на каждом экране значит показать
 * пользователю несколько разных сообщений об одной беде (Query.md).
 *
 * «Сервис лежит» сюда не попадает: об остановленном sing-box демон сообщает
 * ответом, и это состояние экрана, а не отказ панели (NFR-1).
 */
export function DaemonBanner() {
  const status = useDaemonStatus()
  const error = status.error

  const isUnreachable =
    error instanceof ApiError && error.kind === API_FAILURE.Unreachable

  if (!isUnreachable) {
    return null
  }

  return (
    <div
      role="status"
      className="shrink-0 bg-destructive/10 px-6 py-2 text-sm text-destructive"
    >
      metabox не отвечает. Панель показывает последние загруженные данные,
      применять изменения нельзя.
    </div>
  )
}
