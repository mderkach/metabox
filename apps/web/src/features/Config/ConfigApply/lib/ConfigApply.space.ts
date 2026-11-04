import { useEffect, useRef } from 'react';

/**
 * Height of the bar layer while it takes space, visible or still sliding away.
 * The space under a leaving bar is held until the end of the slide, otherwise
 * the screen bottom would jump under it. It is measured by an observer, not
 * once: `sing-box check` output, a failure and the confirmation window change
 * the bar height in place.
 */
export function useBarSpace(visible: boolean, onSpaceChange: (space: number) => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    function reportBarSpace() {
      const layer = ref.current;

      if (!visible || layer === null) {
        onSpaceChange(0);

        return;
      }

      const observer = new ResizeObserver(function measureBar() {
        onSpaceChange(layer.offsetHeight);
      });

      observer.observe(layer);

      return function stopMeasuringBar() {
        observer.disconnect();
      };
    },
    [visible, onSpaceChange]
  );

  return ref;
}
