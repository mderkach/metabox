import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { createStatefulDaemonHandlers } from '@entities/Daemon/__tests__/Daemon.handlers';
import { DATAPLANE_ENDPOINT } from '@entities/Dataplane';
import { DATAPLANE_FIXTURE } from '@entities/Dataplane/__tests__/Dataplane.fixture';
import { createDataplaneMock } from '@entities/Dataplane/__tests__/Dataplane.handlers';
import { DEVICE_ENDPOINT } from '@entities/Device';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';

import { DevicesPage } from '../ui/DevicesPage';

/** Модель обвязки со сменой и статус демона, который эту смену отдаёт. */
function serveDataplane(initial = DATAPLANE_FIXTURE) {
  const mock = createDataplaneMock(initial);

  server.use(...createStatefulDaemonHandlers(mock.status), ...mock.handlers);
}

/** Base UI рисует тумблер `span`-ом: недоступность видна по `aria-disabled`, а не по `disabled`. */
function isLocked(toggle: HTMLElement): boolean {
  return toggle.getAttribute('aria-disabled') === 'true';
}

/** Тумблер устройства, когда модель прочитана и он стал доступен. */
async function readySwitch(device: string): Promise<HTMLElement> {
  const toggle = await screen.findByRole('switch', { name: `Через sing-box: ${device}` });

  await waitFor(() => {
    expect(isLocked(toggle)).toBe(false);
  });

  return toggle;
}

function renderScreen() {
  return renderWithRouter(DevicesPage, { path: '/devices' });
}

function rowOf(label: string): HTMLElement {
  const row = screen.getAllByRole('row').find((item) => within(item).queryByText(label) !== null);

  if (row === undefined) {
    throw new Error(`Строки «${label}» нет в таблице`);
  }

  return row;
}

describe('экран устройств', () => {
  beforeEach(() => {
    serveDataplane();
  });

  it('показывает устройства подписью, адресом, MAC, источником имени, арендой и сетью', async () => {
    server.use(...createDeviceHandlers());

    renderScreen();

    await screen.findByText('Ноутбук');

    const laptop = rowOf('Ноутбук');

    expect(within(laptop).getByText('192.168.1.60')).toBeInTheDocument();
    expect(within(laptop).getByText('aa:bb:cc:00:00:70')).toBeInTheDocument();
    expect(within(laptop).getByText('своё')).toBeInTheDocument();
    expect(within(laptop).getByText('статическая')).toBeInTheDocument();
    expect(within(laptop).getByText('в сети')).toBeInTheDocument();

    // Без имени устройство подписано адресом, без адреса — названо так словами.
    expect(within(rowOf('aa:bb:cc:00:00:40')).getAllByText('192.168.1.36')).toHaveLength(2);
    expect(within(rowOf('Принтер')).getByText('без адреса')).toBeInTheDocument();
    expect(screen.getByText('5 устройств')).toBeInTheDocument();
  });

  it('ведёт к соединениям устройства с отбором по его адресу', async () => {
    server.use(...createDeviceHandlers());

    renderScreen();

    const link = await screen.findByRole('link', { name: 'Соединения устройства Ноутбук' });

    expect(link).toHaveAttribute('href', '/connections?source=192.168.1.60');
    // Перейти к соединениям устройства без адреса нечем: отбор идёт по IP.
    expect(within(rowOf('Принтер')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('переименовывает устройство и берёт список из ответа, а не перечитывает его', async () => {
    const reads = vi.fn<() => void>();
    const renamed = vi.fn<(mac: string, body: unknown) => void>();
    const user = userEvent.setup();

    // Шпионы стоят первыми и ничего не отвечают: запрос проходит дальше, к моку демона.
    server.use(
      http.get(DEVICE_ENDPOINT.devices(), () => {
        reads();
      }),
      http.put(DEVICE_ENDPOINT.device('*'), async ({ request }) => {
        renamed(new URL(request.url).pathname, await request.clone().json());
      }),
      ...createDeviceHandlers()
    );

    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Переименовать iphone-guest' }));

    const field = screen.getByRole('textbox', { name: 'Своё имя для iphone-guest' });

    expect(field).toHaveFocus();
    await user.type(field, 'Телефон гостя');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Телефон гостя')).toBeInTheDocument();
    expect(renamed).toHaveBeenCalledWith('/api/devices/aa%3Abb%3Acc%3A00%3A01%3A04', { name: 'Телефон гостя' });
    expect(within(rowOf('Телефон гостя')).getByText('своё')).toBeInTheDocument();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
      'Устройство теперь подписано «Телефон гостя»'
    );
  });

  it('пустое имя снимает своё, и подпись возвращается к адресу', async () => {
    const user = userEvent.setup();

    server.use(...createDeviceHandlers());
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Переименовать Ноутбук' }));
    await user.clear(screen.getByRole('textbox', { name: 'Своё имя для Ноутбук' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(screen.queryByText('Ноутбук')).not.toBeInTheDocument();
    });
    expect(within(rowOf('aa:bb:cc:00:00:70')).getByText('имени нет')).toBeInTheDocument();
  });

  it('не отправляет имя длиннее потолка демона и называет причину', async () => {
    const renamed = vi.fn<() => void>();
    const user = userEvent.setup();

    server.use(
      http.put(DEVICE_ENDPOINT.device('*'), () => {
        renamed();
      }),
      ...createDeviceHandlers()
    );
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Переименовать tv-living' }));
    await user.type(screen.getByRole('textbox', { name: 'Своё имя для tv-living' }), 'x'.repeat(65));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не длиннее 64 символов');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(renamed).not.toHaveBeenCalled();
  });

  it('Escape отменяет правку и возвращает строку', async () => {
    const user = userEvent.setup();

    server.use(...createDeviceHandlers());
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Переименовать tv-living' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Переименовать tv-living' })).toBeInTheDocument();
  });

  it('пустой ответ демона называет пустотой, а не загрузкой', async () => {
    server.use(http.get(DEVICE_ENDPOINT.devices(), () => HttpResponse.json({ devices: [] })));

    renderScreen();

    expect(await screen.findByText('Устройств не найдено')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('отказ демона показывает причину и повтор, а не пустой список', async () => {
    server.use(
      http.get(DEVICE_ENDPOINT.devices(), () =>
        HttpResponse.json({ code: 'internal', message: 'uci не ответил' }, { status: 500 })
      )
    );

    renderScreen();

    expect(await screen.findByText('Не удалось получить список устройств')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.queryByText('Устройств не найдено')).not.toBeInTheDocument();
  });

  describe('тумблер «через sing-box»', () => {
    it('показывает устройство включённым по MAC в любом регистре и по адресу из source_ip', async () => {
      server.use(...createDeviceHandlers());
      renderScreen();

      expect(await screen.findByRole('switch', { name: 'Через sing-box: iphone-guest' })).toBeChecked();
      expect(await screen.findByRole('switch', { name: 'Через sing-box: tv-living' })).toBeChecked();
      expect(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' })).not.toBeChecked();
    });

    it('после предупреждения шлёт модель с MAC в source_mac и открывает окно подтверждения', async () => {
      const changed = vi.fn<(body: unknown) => void>();
      const user = userEvent.setup();

      server.use(
        http.put(DATAPLANE_ENDPOINT.dataplane(), async ({ request }) => {
          changed(await request.clone().json());
        }),
        ...createDeviceHandlers()
      );
      renderScreen();

      await user.click(await readySwitch('192.168.1.36'));

      const dialog = await screen.findByRole('alertdialog', { name: 'Пустить 192.168.1.36 через sing-box?' });

      expect(dialog).toHaveTextContent('перезапускает sing-box и рвёт текущие соединения');
      expect(changed).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(changed).toHaveBeenCalledTimes(1);
      });
      expect(changed).toHaveBeenCalledWith({
        model: {
          ...DATAPLANE_FIXTURE.model,
          source_mac: ['AA:BB:CC:00:01:04', 'aa:bb:cc:00:00:40'],
          source_ip: ['192.168.1.180'],
        },
      });

      const bar = await screen.findByRole('region', { name: 'Смена перехвата' });

      expect(bar).toHaveTextContent('Список перехвата сменён');
      expect(within(bar).getByRole('button', { name: 'Связь есть, оставить' })).toBeEnabled();
      // Пока смена ждёт подтверждения, вторую не начать.
      expect(isLocked(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' }))).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: 'Через sing-box: 192.168.1.36' })).toBeChecked();
      });
    });

    it('подтверждение шлёт POST и закрывает окно', async () => {
      const confirmed = vi.fn<(path: string) => void>();
      const user = userEvent.setup();

      server.use(
        http.post(DATAPLANE_ENDPOINT.applyConfirm(':id'), ({ request }) => {
          confirmed(new URL(request.url).pathname);
        }),
        ...createDeviceHandlers()
      );
      renderScreen();

      await user.click(await readySwitch('192.168.1.36'));
      await user.click(await screen.findByRole('button', { name: 'Применить' }));
      await user.click(await screen.findByRole('button', { name: 'Связь есть, оставить' }));

      await waitFor(() => {
        expect(screen.queryByRole('region', { name: 'Смена перехвата' })).not.toBeInTheDocument();
      });
      expect(confirmed).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/dataplane\/apply\/.+\/confirm$/));
      await readySwitch('Ноутбук');
    });

    it('откат показывает, на каком шаге встала смена, и исходную ошибку', async () => {
      const rolledBack = {
        id: 'dataplane-1',
        phase: 'rolled_back',
        window: 0,
        reason_code: 'interception_missing',
        reason: 'nft: нет цепочки metabox_prerouting',
      };
      const user = userEvent.setup();

      server.use(
        http.get(DAEMON_ENDPOINT.status(), () =>
          HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, dataplane_transaction: rolledBack })
        ),
        http.get(DATAPLANE_ENDPOINT.applyState(':id'), () => HttpResponse.json(rolledBack)),
        ...createDeviceHandlers()
      );
      renderScreen();

      const bar = await screen.findByRole('region', { name: 'Смена перехвата' });

      expect(bar).toHaveTextContent('Подтверждения не было — прежний список перехвата возвращён');
      expect(bar).toHaveTextContent('после перезапуска правила nft перехвата не стоят');
      expect(bar).toHaveTextContent('nft: нет цепочки metabox_prerouting');

      await user.click(within(bar).getByRole('button', { name: 'Скрыть' }));

      expect(screen.queryByRole('region', { name: 'Смена перехвата' })).not.toBeInTheDocument();
    });

    it('в режиме перехвата для всех тумблер недоступен и объясняет почему', async () => {
      server.use(...createDeviceHandlers());
      serveDataplane({ ...DATAPLANE_FIXTURE, model: { ...DATAPLANE_FIXTURE.model, acl_mode: 'all' } });
      renderScreen();

      await screen.findByText('Ноутбук');
      await waitFor(() => {
        expect(within(rowOf('Ноутбук')).getByText('перехват для всех')).toBeInTheDocument();
      });

      const toggle = screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' });

      expect(isLocked(toggle)).toBe(true);
      expect(toggle).toBeChecked();
    });

    it('смена, отклонённая демоном, окна не открывает и тумблер не запирает', async () => {
      const rejected = vi.fn<() => void>();
      const user = userEvent.setup();

      server.use(
        http.put(DATAPLANE_ENDPOINT.dataplane(), () => {
          rejected();

          return HttpResponse.json({ code: 'apply_in_progress', message: 'применение уже идёт' }, { status: 409 });
        }),
        ...createDeviceHandlers()
      );
      renderScreen();

      await user.click(await readySwitch('192.168.1.36'));
      await user.click(await screen.findByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(rejected).toHaveBeenCalledTimes(1);
      });
      await readySwitch('192.168.1.36');
      expect(screen.queryByRole('region', { name: 'Смена перехвата' })).not.toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Через sing-box: 192.168.1.36' })).not.toBeChecked();
    });
  });
});
