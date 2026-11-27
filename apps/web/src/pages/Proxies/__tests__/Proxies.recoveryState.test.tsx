import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentStore, findValue, selectConfigCurrent, setValue } from '@entities/Config';
import { APPLY_PHASE, DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { DEVICE_ENDPOINT } from '@entities/Device';
import { DELAY_STATE, DELAY_TIMEOUT, PROXY_ENDPOINT, type ProxyNode } from '@entities/Proxy';
import { ConfigApplyBar, useLatestConfigApplySubmission } from '@features/Config/ConfigApply';
import { TestChangeLink } from '@features/Config/ConfigApply/__tests__/ConfigApplyLink.fixture';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { useProxyRealityRecovery } from '@features/Proxy/ProxyRealityRecovery';

const TAG = 'reality';
const FLAG = ['outbounds', 0, 'tls', 'reality', 'support_x25519mlkem768'];
const NODES: ProxyNode[] = [{ name: TAG, type: 'VLESS', delay: null, delayState: DELAY_STATE.Failed, selected: false }];
const BASE = 'a'.repeat(64);
const CHANGED = 'b'.repeat(64);
const TRANSACTION = {
  id: 'reality-1',
  phase: APPLY_PHASE.AwaitingConfirm,
  window: 60_000_000_000,
  sha256: CHANGED,
};

function serveRecovery(original: boolean | undefined, delay = DELAY_TIMEOUT) {
  let text = JSON.stringify({
    outbounds: [
      {
        type: 'vless',
        tag: TAG,
        server: 'proxy.example',
        server_port: 443,
        uuid: '01234567-89ab-4cde-8123-456789abcdef',
        tls: { enabled: true, reality: { enabled: true, support_x25519mlkem768: original } },
      },
    ],
  });
  let submitted = '';
  let etag = `"${BASE}"`;
  let transaction: (Omit<typeof TRANSACTION, 'phase'> & { phase: string }) | undefined;
  const outcome = (draft: string, phase: typeof APPLY_PHASE.Confirmed) => {
    text = draft;
    etag = `"${CHANGED}"`;
    transaction = { ...TRANSACTION, phase, window: 0 };
  };

  server.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text, { headers: { ETag: etag } })),
    http.get(DEVICE_ENDPOINT.devices(), () => HttpResponse.json({ devices: [] })),
    http.get(CONFIG_ENDPOINT.ruleSetFiles(), () => HttpResponse.json({ files: {}, etag })),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, transaction })),
    http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(transaction)),
    http.post(DAEMON_ENDPOINT.apply(), async ({ request }) => {
      submitted = await request.text();
      transaction = TRANSACTION;

      return HttpResponse.json(transaction, { status: 202 });
    }),
    http.post(DAEMON_ENDPOINT.applyConfirm(TRANSACTION.id), () => {
      outcome(submitted, APPLY_PHASE.Confirmed);

      return HttpResponse.json(transaction);
    }),
    http.get(PROXY_ENDPOINT.proxyDelay(TAG), () => HttpResponse.json({ delay })),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(PROXY_ENDPOINT.latency(), () => HttpResponse.json({ servers: [] }))
  );

  return {
    changeRevision: (revision: string) => {
      text = setValue(text, ['log', 'level'], 'debug');
      etag = `"${revision}"`;
    },
    foreignConfirm: (draft: string) => {
      outcome(draft, APPLY_PHASE.Confirmed);
    },
  };
}

function Screen() {
  const initialProbe = useTestProxyDelay();
  const retest = useTestProxyDelay();
  const submission = useLatestConfigApplySubmission();
  const diagnostic = useProxyRealityRecovery({ nodes: NODES, submission, testServer: retest.mutateAsync }).at(0);

  return (
    <>
      <button
        type='button'
        onClick={() => {
          initialProbe.mutate(TAG);
        }}
      >
        Probe
      </button>
      <output aria-label='Recovery phase'>{diagnostic?.state ?? 'none'}</output>
      {diagnostic?.stage !== undefined && (
        <button type='button' onClick={diagnostic.stage}>
          Stage
        </button>
      )}
      {diagnostic?.retry !== undefined && (
        <button type='button' onClick={diagnostic.retry}>
          Retry
        </button>
      )}
      {diagnostic?.restore !== undefined && (
        <button type='button' onClick={diagnostic.restore}>
          Restore
        </button>
      )}
      <ConfigApplyBar ChangeLink={TestChangeLink} onSpaceChange={vi.fn<(space: number) => void>()} />
    </>
  );
}

async function startRecovery() {
  const view = renderWithRouter(Screen);

  await waitFor(() => {
    expect(ConfigDocumentStore.getState().appliedEtag).toBe(`"${BASE}"`);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Probe' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Stage' }));
  expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('staged');

  return view;
}

async function confirmRecovery() {
  await userEvent.click(await screen.findByRole('button', { name: 'Применить' }));
  const diff = await screen.findByRole('dialog', { name: 'Что уйдёт на устройство' });
  await userEvent.click(within(diff).getByRole('button', { name: 'Применить' }));
  expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('applying');

  await userEvent.click(await screen.findByRole('button', { name: 'Связь есть, оставить' }));
}

describe('REALITY recovery attempt', () => {
  afterEach(() => {
    ConfigDocumentStore.getState().reset();
    localStorage.clear();
  });

  it.each([
    { original: false, delay: DELAY_TIMEOUT },
    { original: undefined, delay: 0 },
  ])(
    'stages the original value $original after a confirmed same-server retest returning $delay',
    async ({ original, delay }) => {
      serveRecovery(original, delay);
      await startRecovery();
      await confirmRecovery();
      await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
      const restore = await screen.findByRole('button', { name: 'Restore' });
      expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('no-response');

      act(() => {
        ConfigDocumentStore.getState().edit(['log', 'level'], 'debug');
      });
      await userEvent.click(restore);
      const draft = selectConfigCurrent(ConfigDocumentStore.getState()) ?? '';
      expect(findValue(draft, FLAG)).toBe(original);
      expect(findValue(draft, ['log', 'level'])).toBe('debug');
      expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('return-staged');
    }
  );

  it.each([
    { label: 'no-response', response: () => HttpResponse.json({ delay: DELAY_TIMEOUT }) },
    { label: 'daemon error', response: () => HttpResponse.json({ code: 'core_unavailable' }, { status: 503 }) },
  ])('ignores a delayed $label retest once a newer probe has started for that same node', async ({ response }) => {
    serveRecovery(false);
    await startRecovery();
    await confirmRecovery();

    let finish: () => void = () => {
      throw new Error('Retest promise was not initialized');
    };
    const delayed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const probe = vi.fn<() => void>();
    server.use(
      http.get(PROXY_ENDPOINT.proxyDelay(TAG), async () => {
        probe();
        if (probe.mock.calls.length > 1) return HttpResponse.json({ delay: 100 });

        await delayed;

        return response();
      })
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(probe).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Probe' }));
    await waitFor(() => {
      expect(probe).toHaveBeenCalledTimes(2);
    });
    finish();

    await waitFor(() => expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('ready'));
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('discards a failed retest when the applied revision changes during the probe', async () => {
    const updated = 'c'.repeat(64);
    const { changeRevision } = serveRecovery(false);
    await startRecovery();
    await confirmRecovery();
    server.use(
      http.get(PROXY_ENDPOINT.proxyDelay(TAG), () => {
        changeRevision(updated);

        return HttpResponse.json({ delay: DELAY_TIMEOUT });
      })
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(ConfigDocumentStore.getState().appliedEtag).toBe(`"${updated}"`);
      expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('none');
    });
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('does not attribute a confirm made outside this tab to the staged fix', async () => {
    const { foreignConfirm } = serveRecovery(false);
    const { queryClient } = await startRecovery();
    const draft = selectConfigCurrent(ConfigDocumentStore.getState()) ?? '';

    foreignConfirm(draft);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      await queryClient.invalidateQueries({ queryKey: ['daemon'] });
    });

    await waitFor(() => expect(screen.getByRole('status', { name: 'Recovery phase' })).toHaveTextContent('none'));
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });
});
