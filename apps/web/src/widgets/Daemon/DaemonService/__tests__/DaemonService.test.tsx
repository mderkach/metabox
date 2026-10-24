import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT, getServiceStateOptions } from '@entities/Daemon';
import {
  SERVICE_FAILED_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SERVICE_UNMANAGED_FIXTURE,
  SERVICE_UNREAD_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';

import { DaemonService } from '../ui/DaemonService';

function serveService(state: typeof SERVICE_RUNNING_FIXTURE) {
  server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(state)));
}

afterEach(async () => {
  await i18next.changeLanguage('ru');
});

describe('service state', () => {
  // "0 h" for a process started half an hour ago reads as a malfunction.
  it.each([
    [2443, '40 мин'],
    [30, 'меньше минуты'],
    [7300, '2 ч'],
  ])('uptime of %i s is labeled as "%s"', async (uptime, text) => {
    serveService({ ...SERVICE_RUNNING_FIXTURE, uptime });

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('zero uptime means unknown age: does not show it', async () => {
    serveService({ ...SERVICE_RUNNING_FIXTURE, uptime: 0 });

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('работает')).toBeInTheDocument();
    expect(screen.queryByText('Время работы')).not.toBeInTheDocument();
  });

  it('shows a running service and offers a restart', async () => {
    serveService(SERVICE_RUNNING_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('работает')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезапустить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument();
  });

  // A foreign package can run routing on the device: "Start" would
  // bring up a second copy of sing-box next to the running one.
  it('a process outside the service is shown as running, but without commands', async () => {
    serveService(SERVICE_UNMANAGED_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('работает')).toBeInTheDocument();
    expect(screen.getByText('поднят другой службой')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Запустить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перезапустить' })).not.toBeInTheDocument();
  });

  it('on a crashed service shows the binary output verbatim', async () => {
    serveService(SERVICE_FAILED_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('упал')).toBeInTheDocument();
    expect(screen.getByText(/provider sub-nl not found/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument();
  });

  it.each([
    ['ru', 'procd не ответил демону: состояние службы неизвестно'],
    ['en', 'procd did not answer the daemon: the service state is unknown'],
  ])('a state read failure is translated by code (%s), the daemon text goes as detail', async (language, title) => {
    await i18next.changeLanguage(language);
    serveService(SERVICE_UNREAD_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText('service state not read')).toBeInTheDocument();
  });

  it.each([
    ['ru', 'У службы несколько инстансов procd: укажите инстанс sing-box в настройках демона'],
    ['en', 'The service has several procd instances: name the sing-box instance in the daemon settings'],
  ])('an ambiguous instance is translated by code (%s)', async (language, title) => {
    await i18next.changeLanguage(language);
    serveService({
      ...SERVICE_UNREAD_FIXTURE,
      lastError: 'service sing-box: the service has several instances and no instance name is set',
      lastErrorCode: 'service_instance_ambiguous',
    });

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(/no instance name is set/)).toBeInTheDocument();
  });

  // The daemon serves `stopped` also when procd simply did not answer: this is not a stop.
  it('an unread state without a known previous one is shown neutrally and without commands', async () => {
    serveService(SERVICE_UNREAD_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('состояние неизвестно')).toBeInTheDocument();
    expect(screen.queryByText('остановлен')).not.toBeInTheDocument();
    expect(screen.queryByText('Служба не запустилась')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Запустить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перезапустить' })).not.toBeInTheDocument();
  });

  // The state is updated by the stream: it puts a frame into the query cache, as the test does here.
  it('a frame with an unread state keeps the last confirmed one and the restart', async () => {
    serveService(SERVICE_RUNNING_FIXTURE);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DaemonService heap={0} />
      </QueryClientProvider>
    );

    expect(await screen.findByText('работает')).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(getServiceStateOptions().queryKey, SERVICE_UNREAD_FIXTURE);
    });

    expect(await screen.findByText('procd не ответил демону: состояние службы неизвестно')).toBeInTheDocument();
    expect(screen.getByText('работает')).toBeInTheDocument();
    expect(screen.queryByText('остановлен')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезапустить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Запустить' })).not.toBeInTheDocument();
  });

  it('sends a command to the service and shows the new state from the response', async () => {
    const called = vi.fn<(action: string) => void>();

    // The source of truth is the daemon: after a command the screen rereads the state,
    // so the mock changes the response the way the service would.
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

  it('stops the service only after confirmation', async () => {
    const called = vi.fn<(action: string) => void>();
    const user = userEvent.setup();

    serveService(SERVICE_RUNNING_FIXTURE);
    server.use(
      http.post(DAEMON_ENDPOINT.serviceAction(':action'), ({ params }) => {
        called(String(params.action));
        return HttpResponse.json(SERVICE_RUNNING_FIXTURE);
      })
    );

    renderWithQuery(<DaemonService heap={0} />);

    await user.click(await screen.findByRole('button', { name: 'Остановить' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(called).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Остановить' }));
    await user.click(screen.getByRole('button', { name: 'Остановить sing-box' }));

    await waitFor(() => {
      expect(called).toHaveBeenCalledWith('stop');
    });
  });

  it('restarts the service only after confirmation that names the dropped connections', async () => {
    const called = vi.fn<(action: string) => void>();
    const user = userEvent.setup();

    serveService(SERVICE_RUNNING_FIXTURE);
    server.use(
      http.post(DAEMON_ENDPOINT.serviceAction(':action'), ({ params }) => {
        called(String(params.action));
        return HttpResponse.json(SERVICE_RUNNING_FIXTURE);
      })
    );

    renderWithQuery(<DaemonService heap={0} />);

    await user.click(await screen.findByRole('button', { name: 'Перезапустить' }));

    expect(screen.getByRole('alertdialog', { name: 'Перезапустить sing-box?' })).toHaveTextContent(
      'соединения всех устройств оборвутся'
    );

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(called).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Перезапустить' }));
    await user.click(screen.getByRole('button', { name: 'Перезапустить sing-box' }));

    await waitFor(() => {
      expect(called).toHaveBeenCalledWith('restart');
    });
  });
});
