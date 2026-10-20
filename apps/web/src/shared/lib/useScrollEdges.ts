import { useEffect, useState, type RefObject } from 'react';

/** One pixel of reserve at the edge: at a fractional browser zoom `scrollLeft` does not reach the end exactly. */
const EDGE_SLACK = 1;

export interface ScrollEdges {
  /** There is content hidden by scrolling on the left. */
  start: boolean;
  /** There is content hidden by scrolling on the right. */
  end: boolean;
}

/**
 * Tracks on which side of a horizontal scroller hidden content
 * remains: the edge fades out with a gradient by it, and the strip does not look cut off.
 * Recomputed on scroll and on resize of the scroller and its children.
 * `content` changes together with the set of children: a new child does not
 * get under observation by itself.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, content: unknown): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });

  useEffect(
    function watchScrollEdges() {
      const element = ref.current;

      if (element === null) {
        return;
      }

      // Narrowing of the type does not reach the functions below: the declaration is hoisted.
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
