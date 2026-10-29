import { useIsMutating, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import i18next from 'i18next';

import {
  DAEMON_QUERY,
  getDaemonStatusOptions,
  getServiceStateOptions,
  restartDaemon,
  runServiceAction,
} from '@entities/Daemon';
import { isSessionLost } from '@shared/api';
import { MS_IN_MINUTE, MS_IN_SECOND } from '@shared/lib/time';

/** The response carries the new service state: there is no need to reread it with a separate query. */
export function useServiceAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runServiceAction,
    meta: { showError: true, errorMessageKey: 'toast.service.action.failed' },
    onSuccess: (state) => {
      queryClient.setQueryData(getServiceStateOptions().queryKey, state);
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: DAEMON_QUERY.all }),
  });
}

/**
 * How the panel waits for the daemon after a restart: the status is asked once a
 * second, and a daemon that is not back in a minute is left to the unavailability
 * banner.
 */
export const DAEMON_RESTART = {
  Poll: MS_IN_SECOND,
  Timeout: MS_IN_MINUTE,
} as const;

const DAEMON_RESTART_MUTATION = [...DAEMON_QUERY.all, 'restart'] as const;

async function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Resolves when the status comes from another daemon process. The old process
 * may still answer right after the launch, so a successful status alone does not
 * mean the daemon came back. On timeout the last failure is thrown: an unreachable
 * daemon is shown by the banner, not by a toast.
 */
async function waitForNewInstance(queryClient: QueryClient, previous: string | undefined): Promise<void> {
  const deadline = Date.now() + DAEMON_RESTART.Timeout;
  let failure: unknown = new Error(i18next.t('toast.daemon.restart.stalled', { ns: 'shared' }));

  while (Date.now() < deadline) {
    await pause(DAEMON_RESTART.Poll);

    try {
      // Written into the status cache: the banner and the screens see the daemon return at once.
      // Without retries: a retried step would stretch the poll beyond its second.
      const status = await queryClient.query({ ...getDaemonStatusOptions(), staleTime: 0, retry: false });

      if (status.instance !== previous) {
        return;
      }

      failure = new Error(i18next.t('toast.daemon.restart.stalled', { ns: 'shared' }));
    } catch (error) {
      if (isSessionLost(error)) {
        throw error;
      }

      failure = error;
    }
  }

  throw failure;
}

/**
 * Restarts the daemon and resolves once a new process answers. The mutation stays
 * pending for the whole wait: `useDaemonRestarting` reads exactly that. After the
 * return every query is refetched: the daemon lost what it kept in memory.
 */
export function useDaemonRestart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: DAEMON_RESTART_MUTATION,
    mutationFn: async () => {
      // Without a known process the first answer of the old one would pass for the new one.
      const previous = (await queryClient.query(getDaemonStatusOptions())).instance;

      await restartDaemon();
      await waitForNewInstance(queryClient, previous);
    },
    meta: {
      showError: true,
      errorMessageKey: 'toast.daemon.restart.failed',
      showSuccess: true,
      successMessageKey: 'toast.daemon.restart.done',
    },
    onSuccess: async () => queryClient.invalidateQueries(),
  });
}

/** The daemon is being restarted from this tab: its silence is expected, not a failure. */
export function useDaemonRestarting(): boolean {
  return useIsMutating({ mutationKey: DAEMON_RESTART_MUTATION }) > 0;
}
