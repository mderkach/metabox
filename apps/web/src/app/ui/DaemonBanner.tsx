import { CircleAlert, Unplug } from 'lucide-react';
import { useState, type TransitionEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useDaemonReachable, useDaemonStatus } from '@entities/Daemon';
import { API_FAILURE, ApiError } from '@shared/api';
import { useReducedMotion } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';

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
  const reducedMotion = useReducedMotion();
  const unreachable = status.error instanceof ApiError && status.error.kind === API_FAILURE.Unreachable;
  const message = unreachable ? 'banner.unreachable' : 'banner.schema';
  // Уходящая полоса сворачивается с тем текстом, с которым её видели: после
  // ответа демона ошибки уже нет, и вместо «не отвечает» мелькнула бы схема.
  const [held, setHeld] = useState<typeof message | null>(null);

  if (!reachable && held !== message) {
    setHeld(message);
  }

  // Текст снимается, когда полоса свернулась: следующий отказ вставит его в
  // живую область заново. Снятие `aria-hidden` с готового узла объявляют не
  // все скринридеры, вставку — все. Без анимации `transitionend` не придёт.
  if (reachable && reducedMotion && held !== null) {
    setHeld(null);
  }

  function dropHeld(event: TransitionEvent<HTMLDivElement>) {
    if (reachable && event.target === event.currentTarget) {
      setHeld(null);
    }
  }

  // Высоту анимирует CSS, как у бара применения: экран под полосой —
  // именованная группа `page`, вне перехода роутера она не анимируется, и
  // граница `<ViewTransition>` оставила бы его прыгать (ADR-0026). Живая
  // область стоит в DOM постоянно — иначе её первое сообщение не объявится.
  return (
    <div
      role='status'
      onTransitionEnd={dropHeld}
      className={cn(
        'grid shrink-0 transition-[grid-template-rows] duration-(--view-transition-panel) ease-(--view-transition-ease) motion-reduce:transition-none',
        reachable ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
      )}
    >
      <div inert={reachable} aria-hidden={reachable} className='min-h-0 overflow-hidden'>
        {held !== null && (
          <div className='border-b border-destructive/20 bg-destructive/10 px-4 py-2.5 sm:px-6'>
            <div className='flex min-h-7 items-center gap-2.5 text-sm text-destructive'>
              {held === 'banner.unreachable' ? (
                <Unplug className='size-4 shrink-0' />
              ) : (
                <CircleAlert className='size-4 shrink-0' />
              )}
              <p>{t(held)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
