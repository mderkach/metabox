import { useEffect, useState, type RefObject } from 'react';

/** Пиксель запаса на краю: при дробном масштабе браузера `scrollLeft` не доходит до конца ровно. */
const EDGE_SLACK = 1;

export interface ScrollEdges {
  /** Слева есть скрытое прокруткой. */
  start: boolean;
  /** Справа есть скрытое прокруткой. */
  end: boolean;
}

/**
 * Следит, с какой стороны горизонтального скроллера осталось скрытое
 * содержимое: по нему край гаснет градиентом и полоса не выглядит обрезанной.
 * Пересчитывается на прокрутке и на смене размера скроллера и его детей.
 * `content` меняется вместе с составом детей: новый ребёнок сам под
 * наблюдение не встаёт.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, content: unknown): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });

  useEffect(
    function watchScrollEdges() {
      const element = ref.current;

      if (element === null) {
        return;
      }

      // Функциям ниже сужение типа не доходит: объявление поднимается.
      const scroller = element;

      function syncEdges() {
        const start = scroller.scrollLeft > EDGE_SLACK;
        const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - EDGE_SLACK;

        setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
      }

      syncEdges();
      scroller.addEventListener('scroll', syncEdges, { passive: true });
      const observer = new ResizeObserver(syncEdges);
      observer.observe(scroller);

      for (const each of scroller.children) {
        observer.observe(each);
      }

      return function stopWatchingScrollEdges() {
        scroller.removeEventListener('scroll', syncEdges);
        observer.disconnect();
      };
    },
    [ref, content]
  );

  return edges;
}
