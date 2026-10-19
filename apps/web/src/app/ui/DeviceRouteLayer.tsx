import { useEffect, useRef } from 'react';

import { DeviceRouteBar, useDeviceRouteTransaction } from '@features/Device/DeviceRoute';

/**
 * The interception change bar floats over the bottom edge of any screen, above
 * the config apply bar: the confirmation window asks to check the connection,
 * and the user goes to another screen to do it. A bar on the devices screen
 * alone would be gone after the first transition, and the daemon would roll
 * the change back.
 *
 * `bottom` is the space the apply bar takes; `onSpaceChange` reports the
 * space from the bar top to the bottom edge, so the screen bottom is not
 * covered.
 */
export function DeviceRouteLayer({
  bottom,
  onSpaceChange,
}: {
  bottom: number;
  onSpaceChange: (space: number) => void;
}) {
  const route = useDeviceRouteTransaction();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    function reportLayerSpace() {
      const layer = ref.current;
      const parent = layer?.offsetParent;

      if (layer === null || !(parent instanceof HTMLElement)) {
        return;
      }

      const observer = new ResizeObserver(function measureLayer() {
        onSpaceChange(layer.offsetHeight === 0 ? 0 : parent.clientHeight - layer.offsetTop);
      });

      observer.observe(layer);

      return function stopMeasuringLayer() {
        observer.disconnect();
        onSpaceChange(0);
      };
    },
    [bottom, onSpaceChange]
  );

  // Without the apply bar the layer keeps the same gap to the edge as that bar.
  return (
    <div
      ref={ref}
      style={{ bottom: bottom > 0 ? bottom : undefined }}
      className='absolute inset-x-3 bottom-3 z-10 mx-auto max-w-4xl rounded-xl bg-popover px-4 py-2.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 [view-transition-name:device-route-bar] empty:hidden'
    >
      <DeviceRouteBar transaction={route.transaction} isConfirming={route.isConfirming} onConfirm={route.confirm} />
    </div>
  );
}
