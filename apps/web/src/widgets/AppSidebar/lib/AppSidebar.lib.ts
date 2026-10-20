import { useCallback, useState } from 'react';
import { z } from 'zod';

import { toConfirmedStatus, useDaemonReachable, useServiceState, type ServiceStatus } from '@entities/Daemon';

const STORAGE_KEY = 'metabox.sidebar.collapsed';

/** Storage returns a string, and it can be anything: the key outlives panel versions. */
const StoredCollapsedSchema = z.enum(['true', 'false']);

/** In a private window, storage access throws. */
function readCollapsed(): boolean {
  try {
    const stored = StoredCollapsedSchema.safeParse(globalThis.localStorage.getItem(STORAGE_KEY));

    if (stored.success) {
      return stored.data === 'true';
    }
  } catch {
    // Storage is unavailable — the panel opens expanded.
  }

  return false;
}

function writeCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Not saved — the panel returns to the expanded view.
  }
}

/**
 * Current menu item by address: an exact match, otherwise the longest
 * prefix. Config section tabs live at their own addresses, and without
 * the prefix the Config item would go dark on each of them except the first.
 */
export function pickActiveNav(pathname: string, targets: readonly string[]): string | null {
  let active: string | null = null;

  for (const target of targets) {
    const matches = pathname === target || pathname.startsWith(`${target}/`);

    if (matches && (active === null || target.length > active.length)) {
      active = target;
    }
  }

  return active;
}

/**
 * Sidebar state. The choice survives a page reload. On a narrow
 * screen there is no sidebar at all — navigation is in the bottom bar there — so
 * width is not considered here.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Storage is written outside the state update: React calls the updater
  // function twice in strict mode, and the write would go into it along with the rest.
  const toggle = useCallback(() => {
    const next = !collapsed;

    writeCollapsed(next);
    setCollapsed(next);
  }, [collapsed]);

  return { collapsed, toggle };
}

/** Service state for the shell; `null` while the daemon is silent or the state is unread. */
export function useShellServiceStatus(): ServiceStatus | null {
  const reachable = useDaemonReachable();
  const service = useServiceState();

  return reachable && service.data !== undefined ? toConfirmedStatus(service.data) : null;
}
