import { worker } from '@test/browserWorker';
import { renderWithRouter } from '@test/renderWithRouter';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { DIAG_ENDPOINT } from '@entities/Diag';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { DiagnosticsPage } from '../ui/DiagnosticsPage';

describe('diagnostics screen picked with the mouse', () => {
  it('checks the outbound through the selected node, by default through the first group', async () => {
    const targets: (string | null)[] = [];

    worker.use(
      ...proxyHandlers,
      http.get(DIAG_ENDPOINT.report(), ({ request }) => {
        targets.push(new URL(request.url).searchParams.get('proxy'));

        return HttpResponse.json({ checks: [{ name: 'proxy', status: 'ok', delay_ms: 90 }] });
      })
    );

    renderWithRouter(DiagnosticsPage, { path: '/diagnostics' });

    const run = await screen.findByRole('button', { name: 'Проверить' });
    const select = screen.getByRole('combobox', { name: 'Узел для проверки выхода' });

    await waitFor(() => {
      expect(within(select).getByText('us-fallback')).toBeVisible();
    });
    await userEvent.click(run);
    await screen.findByText('90 мс');

    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: 'не проверять выход через узел' }));
    await userEvent.click(run);

    await waitFor(() => {
      expect(targets).toEqual(['us-fallback', null]);
    });
  });
});
