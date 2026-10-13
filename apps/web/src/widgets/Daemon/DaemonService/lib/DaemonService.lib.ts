import { useState } from 'react';

import { toConfirmedStatus, type ServiceState } from '@entities/Daemon';

/**
 * The last service state that the daemon read, not substituted. `null` means
 * there has been no confirmed state since mount. The stream sends the state
 * every few seconds, and one failed procd read must not recolor
 * the card: until the next successful frame it shows what was known.
 */
export function useLastConfirmedService(state: ServiceState | undefined): ServiceState | null {
  const [last, setLast] = useState<ServiceState | null>(null);
  const confirmed = state !== undefined && toConfirmedStatus(state) !== null ? state : null;

  if (confirmed !== null && confirmed !== last) {
    setLast(confirmed);
  }

  return confirmed ?? last;
}
