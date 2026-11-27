import { useEffect, useRef } from 'react';

import { APPLY_PHASE } from '@entities/Daemon';
import { DeviceRouteBar, useDeviceRouteTransaction } from '@features/Device/DeviceRoute';

/**
 * The interception confirmation on every screen, above the apply bar: the user
 * leaves the devices screen to check the connection. `bottom` is the apply bar
 * space; `onSpaceChange` reports the space from this bar's top to the edge.
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

  const previousFocus = useRef<HTMLElement | null>(null);
  const confirming = useRef<string | null>(null);

  useEffect(
    function restoreConfirmationFocus() {
      if (route.transaction?.id !== confirming.current || route.transaction.phase !== APPLY_PHASE.Confirmed) return;
      confirming.current = null;
      if (document.activeElement === document.body && previousFocus.current?.isConnected === true)
        previousFocus.current.focus();
    },
    [route.transaction]
  );

  useEffect(
    function reportLayerSpace() {
      const layer = ref.current;
      // Not `offsetParent`: the layer is `display: none` while the bar is empty, and then it has none.
      const parent = layer?.parentElement;

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

  return (
    <div
      ref={ref}
      onFocusCapture={(event) => {
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && event.currentTarget.contains(from)) return;
        previousFocus.current = from instanceof HTMLElement ? from : null;
      }}
      style={{ bottom: bottom > 0 ? bottom : undefined }}
      className='absolute inset-x-3 bottom-3 z-10 mx-auto max-w-4xl rounded-xl bg-popover px-4 py-2.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 [view-transition-name:device-route-bar] empty:hidden'
    >
      <DeviceRouteBar
        transaction={route.transaction}
        isConfirming={route.isConfirming}
        onConfirm={() => {
          confirming.current = route.transaction?.id ?? null;
          route.confirm();
        }}
      />
    </div>
  );
}
