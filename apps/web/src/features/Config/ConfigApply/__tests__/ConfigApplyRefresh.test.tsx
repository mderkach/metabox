import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, getApplyStateOptions } from '@entities/Config';
import {
  APPLY_PHASE,
  DAEMON_ENDPOINT,
  getClashConfigsOptions,
  getServiceStateOptions,
  getTrafficHistoryOptions,
  type ApplyTransaction,
} from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { getProxiesOptions, getProxyProvidersOptions, PROXY_ENDPOINT, useProxies } from '@entities/Proxy';
import { CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { getRouteExplanationOptions, getRuleHitsOptions, ROUTE_ENDPOINT, useRuleHits } from '@entities/Route';
import { ROUTE_EXPLANATION_FIXTURE } from '@entities/Route/__tests__/Route.fixture';

import { useConfigApply } from '../lib/ConfigApply.lib';
import { ConfigApplyStore } from '../model/ConfigApply.store';

const TRANSACTION: ApplyTransaction = {
  id: 'refresh-1',
  phase: APPLY_PHASE.AwaitingConfirm,
  window: 60_000_000_000,
};
const HITS = { seconds: 10, rules: [], final: 12 };
const RUNTIME_KEYS = [
  getProxiesOptions().queryKey,
  getProxyProvidersOptions().queryKey,
  getRuleHitsOptions().queryKey,
  getRouteExplanationOptions('c-1').queryKey,
  getClashConfigsOptions().queryKey,
  getServiceStateOptions().queryKey,
];

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

  client.setQueryData(getProxiesOptions().queryKey, CLASH_PROXIES_FIXTURE);
  client.setQueryData(getProxyProvidersOptions().queryKey, CLASH_PROVIDERS_FIXTURE);
  client.setQueryData(getRuleHitsOptions().queryKey, HITS);
  client.setQueryData(getRouteExplanationOptions('c-1').queryKey, ROUTE_EXPLANATION_FIXTURE);
  client.setQueryData(getClashConfigsOptions().queryKey, CLASH_CONFIGS_FIXTURE);
  client.setQueryData(getServiceStateOptions().queryKey, SERVICE_RUNNING_FIXTURE);
  client.setQueryData(getTrafficHistoryOptions().queryKey, TRAFFIC_HISTORY_FIXTURE);

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return { client, Wrapper };
}

function serveTransaction(phase: typeof TRANSACTION.phase) {
  const transaction = { ...TRANSACTION, phase };

  server.use(
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, transaction })),
    http.get(DAEMON_ENDPOINT.applyState(transaction.id), () => HttpResponse.json(transaction))
  );
}

describe('ConfigApply runtime refresh', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigApplyStore.setState({ submitted: null });
  });

  it('refetches active proxies and rule hits when the confirmation succeeds', async () => {
    const { Wrapper } = createClient();
    let transaction = TRANSACTION;

    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, transaction })),
      http.get(DAEMON_ENDPOINT.applyState(transaction.id), () => HttpResponse.json(transaction)),
      http.post(DAEMON_ENDPOINT.applyConfirm(transaction.id), () => {
        transaction = { ...TRANSACTION, phase: APPLY_PHASE.Confirmed };

        return HttpResponse.json(transaction);
      }),
      http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
      http.get(ROUTE_ENDPOINT.hits(), () => HttpResponse.json({ ...HITS, final: 0 }))
    );
    const hook = renderHook(() => ({ apply: useConfigApply(), proxies: useProxies(), hits: useRuleHits() }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(hook.result.current.apply.transaction?.phase).toBe(APPLY_PHASE.AwaitingConfirm);
    });
    expect(hook.result.current.proxies.data?.groups.length).toBeGreaterThan(0);
    expect(hook.result.current.hits.data?.final).toBe(HITS.final);

    act(() => {
      hook.result.current.apply.confirm();
    });

    await waitFor(() => {
      expect(hook.result.current.apply.transaction?.phase).toBe(APPLY_PHASE.Confirmed);
      expect(hook.result.current.proxies.data?.groups).toEqual([]);
      expect(hook.result.current.hits.data?.final).toBe(0);
    });
  });

  it('marks inactive runtime queries stale after finding a confirmed transaction on reload', async () => {
    const { client, Wrapper } = createClient();

    serveTransaction(APPLY_PHASE.Confirmed);
    const hook = renderHook(useConfigApply, { wrapper: Wrapper });

    await waitFor(() => {
      expect(hook.result.current.transaction?.phase).toBe(APPLY_PHASE.Confirmed);
      for (const key of RUNTIME_KEYS) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    });
    expect(client.getQueryState(getTrafficHistoryOptions().queryKey)?.isInvalidated).toBe(false);

    act(() => {
      client.setQueryData(getProxiesOptions().queryKey, CLASH_PROXIES_FIXTURE);
      client.setQueryData(getApplyStateOptions(TRANSACTION.id).queryKey, {
        ...TRANSACTION,
        phase: APPLY_PHASE.Confirmed,
      });
    });
    hook.rerender();

    expect(client.getQueryState(getProxiesOptions().queryKey)?.isInvalidated).toBe(false);
  });

  it.each([APPLY_PHASE.Applying, APPLY_PHASE.AwaitingConfirm, APPLY_PHASE.RolledBack, APPLY_PHASE.Failed])(
    'keeps runtime queries fresh in phase %s',
    async (phase) => {
      const { client, Wrapper } = createClient();

      serveTransaction(phase);
      const hook = renderHook(useConfigApply, { wrapper: Wrapper });

      await waitFor(() => {
        expect(hook.result.current.transaction?.phase).toBe(phase);
      });
      for (const key of RUNTIME_KEYS) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    }
  );
});
