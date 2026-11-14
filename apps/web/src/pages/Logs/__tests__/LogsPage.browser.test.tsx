import { worker } from '@test/browserWorker';
import { renderWithRouter } from '@test/renderWithRouter';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { LOG_ENDPOINT, LogStore } from '@entities/Log';
import { FakeLogSource } from '@entities/Log/__tests__/Log.source';

import { LogsPage } from '../ui/LogsPage';

describe('logs screen picked with the mouse', () => {
  beforeEach(() => {
    FakeLogSource.opened = [];
    vi.stubGlobal('EventSource', FakeLogSource);
    LogStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the level goes into both the tail request and the stream', async () => {
    const levels: (string | null)[] = [];

    worker.use(
      http.get(LOG_ENDPOINT.logs(), ({ request }) => {
        levels.push(new URL(request.url).searchParams.get('level'));

        return HttpResponse.json({ source: 'logread', entries: [] });
      })
    );

    renderWithRouter(LogsPage, { path: '/logs' });

    await screen.findByText('Строк нет');
    expect(FakeLogSource.last().url).toBe('/api/logs/stream?level=info');

    await userEvent.click(screen.getByRole('combobox', { name: 'Минимальный уровень лога' }));
    await userEvent.click(await screen.findByRole('option', { name: 'warn и выше' }));

    await waitFor(() => {
      expect(levels.at(-1)).toBe('warn');
    });
    expect(levels[0]).toBe('info');
    expect(FakeLogSource.last().url).toBe('/api/logs/stream?level=warn');
    expect(FakeLogSource.opened[0].closed).toBe(true);
  });
});
