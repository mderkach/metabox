import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { FunctionComponent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { fingerprint } from '@shared/lib/fingerprint';

import { ConfigApplyStore } from '../model/ConfigApply.store';
import { ConfigApplyBar } from '../ui/ConfigApplyBar';

async function renderScreen(Component: FunctionComponent) {
  const { router } = renderWithRouter(Component);

  await act(async () => {
    await router.load();
  });
}

function Screen() {
  return <ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />;
}

const APPLIED = '{\n  "log": { "level": "info" }\n}';
const APPLIED_ETAG = `"${'e'.repeat(64)}"`;
const DRAFT = '{\n  "log": { "level": "debug" }\n}';
const NEWER_DRAFT = '{\n  "log": { "level": "trace" }\n}';

const AWAITING = {
  id: 'tx-1',
  phase: 'awaiting_confirm',
  window: 60_000_000_000,
  sha256: 'a'.repeat(64),
};
const CONFIRMED = { ...AWAITING, phase: 'confirmed', window: 0 };

function serveStatus(transaction?: typeof AWAITING | typeof CONFIRMED) {
  server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, transaction })));
}

/** Starts an Apply of the current draft through the summary dialog. */
async function applyFromSummary() {
  await userEvent.click(screen.getByRole('button', { name: 'Применить' }));
  const summary = await screen.findByRole('dialog', { name: 'Что уйдёт на устройство' });

  await userEvent.click(within(summary).getByRole('button', { name: 'Применить' }));
}

describe('ConfigApply draft after the cycle ends', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigApplyStore.setState({ submitted: null });
    ConfigDocumentState.getState().load(APPLIED, APPLIED_ETAG);
    serveStatus();
  });

  it('keeps a new draft when a reload shows an Apply that this tab did not send', async () => {
    const stateRead = vi.fn<() => void>();

    serveStatus(CONFIRMED);
    server.use(
      http.get(DAEMON_ENDPOINT.applyState(CONFIRMED.id), () => {
        stateRead();

        return HttpResponse.json(CONFIRMED);
      })
    );
    ConfigDocumentState.getState().replace(DRAFT);
    await renderScreen(Screen);

    await waitFor(() => {
      expect(stateRead).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(ConfigDocumentState.getState().draft).toBe(DRAFT);
  });

  it('clears the draft when the Apply this tab sent is confirmed', async () => {
    server.use(
      http.post(DAEMON_ENDPOINT.apply(), () => HttpResponse.json(CONFIRMED, { status: 202 })),
      http.get(DAEMON_ENDPOINT.applyState(CONFIRMED.id), () => HttpResponse.json(CONFIRMED))
    );
    ConfigDocumentState.getState().replace(DRAFT);
    await renderScreen(Screen);

    await applyFromSummary();

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toBeNull();
    });
  });

  it('keeps edits typed during the Apply and moves their base to the sent text', async () => {
    server.use(
      http.post(DAEMON_ENDPOINT.apply(), () => HttpResponse.json(AWAITING, { status: 202 })),
      http.post(DAEMON_ENDPOINT.applyConfirm(AWAITING.id), () => HttpResponse.json(CONFIRMED)),
      http.get(DAEMON_ENDPOINT.applyState(AWAITING.id), () => HttpResponse.json(AWAITING))
    );
    ConfigDocumentState.getState().replace(DRAFT);
    await renderScreen(Screen);

    await applyFromSummary();
    const confirm = await screen.findByRole('button', { name: 'Связь есть, оставить' });

    act(() => {
      ConfigDocumentState.getState().replace(NEWER_DRAFT);
    });
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(ConfigApplyStore.getState().submitted).toBeNull();
    });

    expect(ConfigDocumentState.getState().draft).toBe(NEWER_DRAFT);
    expect(ConfigDocumentState.getState().draftBase).toBe(fingerprint(DRAFT));
  });
});
