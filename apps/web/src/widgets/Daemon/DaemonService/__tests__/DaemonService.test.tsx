import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  SERVICE_DRIFT_FIXTURE,
  SERVICE_FAILED_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SERVICE_UNMANAGED_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';

import { DaemonService } from '../ui/DaemonService';

function serveService(state: typeof SERVICE_RUNNING_FIXTURE) {
  server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(state)));
}

describe('состояние сервиса', () => {
  it('показывает работающий сервис и предлагает перезапуск', async () => {
    serveService(SERVICE_RUNNING_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('работает')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезапустить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument();
  });

  // AC-36: маршрутизацию на устройстве может вести чужой пакет — «Запустить»
  // подняло бы вторую копию sing-box рядом с работающей.
  it('процесс мимо службы показывает работающим, но без команд', async () => {
    serveService(SERVICE_UNMANAGED_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('работает')).toBeInTheDocument();
    expect(screen.getByText('поднят другой службой')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Запустить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перезапустить' })).not.toBeInTheDocument();
  });

  it('на упавшем сервисе показывает вывод бинаря дословно', async () => {
    serveService(SERVICE_FAILED_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('упал')).toBeInTheDocument();
    expect(screen.getByText(/provider sub-nl not found/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument();
  });

  it('шлёт команду сервису и показывает новое состояние из ответа', async () => {
    const called = vi.fn<(action: string) => void>();

    // Источник истины — демон: после команды экран перечитывает состояние,
    // поэтому мок меняет ответ так же, как это сделал бы сервис.
    let state: typeof SERVICE_RUNNING_FIXTURE = SERVICE_FAILED_FIXTURE;

    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(state)),
      http.post(DAEMON_ENDPOINT.serviceAction(':action'), ({ params }) => {
        called(String(params.action));
        state = SERVICE_RUNNING_FIXTURE;

        return HttpResponse.json(state);
      })
    );

    const user = userEvent.setup();

    renderWithQuery(<DaemonService heap={0} />);

    await user.click(await screen.findByRole('button', { name: 'Запустить' }));

    await waitFor(() => {
      expect(called).toHaveBeenCalledWith('start');
    });
    expect(await screen.findByText('работает')).toBeInTheDocument();
  });

  it('расхождение версии бинаря со схемой предупреждает, но ничего не запрещает', async () => {
    serveService(SERVICE_DRIFT_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('Версия sing-box разошлась со схемой форм')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезапустить' })).toBeEnabled();
  });

  it('на совпадающих версиях предупреждения нет', async () => {
    serveService(SERVICE_RUNNING_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    await screen.findByText('работает');

    expect(screen.queryByText('Версия sing-box разошлась со схемой форм')).not.toBeInTheDocument();
  });
});
