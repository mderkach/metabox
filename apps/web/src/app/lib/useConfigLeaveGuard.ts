import { useEffect } from 'react';

import { useConfigDirty } from '@entities/Config';

/** Attaches only while dirty so clean pages remain eligible for the browser's back/forward cache. */
export function useConfigLeaveGuard(): void {
  const isDirty = useConfigDirty();

  useEffect(
    function guardLeave() {
      if (!isDirty) return;

      function confirmLeave(event: BeforeUnloadEvent) {
        event.preventDefault();
        // Browsers before Chrome 119 ask only when `returnValue` is set.
        event.returnValue = true;
      }

      globalThis.addEventListener('beforeunload', confirmLeave);

      return function releaseLeave() {
        globalThis.removeEventListener('beforeunload', confirmLeave);
      };
    },
    [isDirty]
  );
}
