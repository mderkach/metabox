import { createContext, use, useEffect, useMemo, useState, type ReactNode, type TransitionEvent } from 'react';

import { useReducedMotion } from '../lib/media';
import { MS_IN_SECOND } from '../lib/time';
import { cn } from '../lib/utils';

/**
 * Колонка панели — её ширина плюс зазор до списка. Зазор живёт в колонке, а не
 * в `gap` сетки: у закрытой панели он остался бы полосой справа от списка.
 */
const COLUMNS_OPEN = 'grid-cols-[minmax(0,1fr)_calc(var(--container-md)+--spacing(4))]';
const COLUMNS_CLOSED = 'grid-cols-[minmax(0,1fr)_0rem]';

/** Конец выезда панели: по нему колонка сворачивается. */
const PANEL_PROPERTY = 'translate';

/**
 * Запас на случай, когда `transitionend` не придёт: переход прерван или не
 * начался, потому что панель открыли и закрыли в одном кадре. Дольше самого
 * выезда, чтобы не обрезать его.
 */
const SETTLE_FALLBACK_SECONDS = 0.5;
const SETTLE_FALLBACK = SETTLE_FALLBACK_SECONDS * MS_IN_SECOND;

interface SidePanelState {
  open: boolean;
  /** Панель уехала, и держать её колонку и содержимое больше незачем. */
  settled: boolean;
}

const SidePanelContext = createContext<SidePanelState>({ open: false, settled: true });

/**
 * Список и панель рядом с ним.
 *
 * Ширина списка меняется один раз, а движется только панель: на открытии
 * колонка встаёт сразу и панель въезжает в неё, на закрытии панель уезжает и
 * колонка сворачивается после. Переход ширины сетки перекладывал бы таблицу на
 * каждом кадре, и строки, которым стало тесно, переносились бы на вторую строку
 * посреди движения.
 *
 * Без анимации (`prefers-reduced-motion`) `transitionend` не приходит —
 * колонка и уходящее содержимое снимаются тем же рендером.
 */
function SidePanelLayoutRoot({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [settled, setSettled] = useState(!open);

  if (open && settled) {
    setSettled(false);
  }

  if (!open && !settled && reducedMotion) {
    setSettled(true);
  }

  const state = useMemo(() => ({ open, settled }), [open, settled]);

  useEffect(
    function settleWithoutTransition() {
      if (open || settled) {
        return;
      }

      const timer = setTimeout(function settleLate() {
        setSettled(true);
      }, SETTLE_FALLBACK);

      return function cancelSettleTimer() {
        clearTimeout(timer);
      };
    },
    [open, settled]
  );

  function settle(event: TransitionEvent<HTMLDivElement>) {
    if (
      !open &&
      event.propertyName === PANEL_PROPERTY &&
      event.target instanceof HTMLElement &&
      event.target.dataset.slot === 'side-panel'
    ) {
      setSettled(true);
    }
  }

  return (
    <SidePanelContext value={state}>
      <div
        data-slot='side-panel-layout'
        onTransitionEnd={settle}
        onTransitionCancel={settle}
        className={cn('grid grid-rows-[minmax(0,1fr)]', settled ? COLUMNS_CLOSED : COLUMNS_OPEN, className)}
      >
        {children}
      </div>
    </SidePanelContext>
  );
}

function SidePanelLayoutMain({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>{children}</div>;
}

/**
 * Панель въезжает справа в уже вставшую колонку; колонка её обрезает. Закрытая
 * панель, пока уезжает, показывает то, с чем её закрыли, а не пустоту.
 *
 * `className` — обёртке панели, например `items-start` для панели ниже
 * высоты списка или липкой панели.
 */
function SidePanelLayoutPanel({ className, children }: { className?: string; children: ReactNode }) {
  const { open, settled } = use(SidePanelContext);
  const [held, setHeld] = useState<ReactNode>(open ? children : null);

  if (open && held !== children) {
    setHeld(children);
  }

  const shown = open ? children : !settled && held;

  return (
    <div inert={!open} aria-hidden={!open} className='flex min-w-0 justify-end overflow-clip'>
      <div
        data-slot='side-panel'
        className={cn(
          'grid w-md shrink-0 grid-rows-[minmax(0,1fr)] transition-[opacity,translate] ease-(--motion-ease-out) motion-reduce:transition-none',
          open
            ? 'translate-x-0 opacity-100 duration-(--motion-enter)'
            : 'translate-x-full opacity-0 duration-(--motion-exit)',
          className
        )}
      >
        {shown}
      </div>
    </div>
  );
}

export { SidePanelLayoutMain as Main, SidePanelLayoutPanel as Panel, SidePanelLayoutRoot as Root };
