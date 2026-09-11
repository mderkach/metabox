import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStore } from '@entities/Connection';
import { makeConnectionsSnapshot } from '@entities/Connection';
import { API_ENDPOINT } from '@shared/api';

import { ConnectionsPage } from '../ui/ConnectionsPage';

describe('экран соединений', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    mockVirtualSizes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('на тысячах соединений держит в DOM окно, а не весь список', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(5000));
    renderWithQuery(<ConnectionsPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Закрыть соединение/ }).length).toBeGreaterThan(0);
    });

    const rendered = screen.getAllByRole('button', { name: /Закрыть соединение/ });

    expect(rendered.length).toBeLessThan(100);
  });

  it('закрывает соединение по адресу из общей константы', async () => {
    const closed = vi.fn<(id: string) => void>();

    server.use(
      http.delete(`${API_ENDPOINT.clashConnections()}/:id`, ({ params }) => {
        closed(String(params.id));

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderWithQuery(<ConnectionsPage />);

    const button = await screen.findAllByRole('button', { name: /Закрыть соединение/ });

    await user.click(button[0]);

    await waitFor(() => {
      expect(closed).toHaveBeenCalledTimes(1);
    });
  });

  it('на паузе новые снапшоты не меняют экран', async () => {
    const user = userEvent.setup();

    renderWithQuery(<ConnectionsPage />);
    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));

    await user.click(screen.getByRole('button', { name: 'Пауза' }));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(40));

    expect(ConnectionStore.getState().active).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('закрытые собирает панель, потому что рантайм отдаёт только живые', async () => {
    const user = userEvent.setup();

    renderWithQuery(<ConnectionsPage />);
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(1));

    await user.click(screen.getByRole('tab', { name: /Закрытые/ }));

    expect(screen.getByText(/рантайм отдаёт только живые/)).toBeInTheDocument();
  });
});
