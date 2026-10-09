import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
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

describe('состояние сервиса', () => {
  it('показывает работающий сервис и предлагает перезапуск', async () => {
    serveService(SERVICE_RUNNING_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText('работает')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезапустить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument();
  });

  // Маршрутизацию на устройстве может вести чужой пакет — «Запустить»
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

  it.each([
    ['ru', 'procd не ответил демону: состояние службы неизвестно'],
    ['en', 'procd did not answer the daemon: the service state is unknown'],
  ])('отказ чтения состояния переводит по коду (%s), текст демона — подробностью', async (language, title) => {
    await i18next.changeLanguage(language);
    serveService(SERVICE_UNREAD_FIXTURE);

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText('состояние сервиса не прочитано')).toBeInTheDocument();
  });

  it.each([
    ['ru', 'У службы несколько инстансов procd: укажите инстанс sing-box в настройках демона'],
    ['en', 'The service has several procd instances: name the sing-box instance in the daemon settings'],
  ])('неоднозначный инстанс переводит по коду (%s)', async (language, title) => {
    await i18next.changeLanguage(language);
    serveService({
      ...SERVICE_UNREAD_FIXTURE,
      lastError: 'служба sing-box: у службы несколько инстансов, а имя инстанса не задано',
      lastErrorCode: 'service_instance_ambiguous',
    });

    renderWithQuery(<DaemonService heap={0} />);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(/имя инстанса не задано/)).toBeInTheDocument();
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

  it('останавливает сервис только после подтверждения', async () => {
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
});
