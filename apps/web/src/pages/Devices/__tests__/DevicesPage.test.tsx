import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { createStatefulDaemonHandlers } from '@entities/Daemon/__tests__/Daemon.handlers';
import { DATAPLANE_ENDPOINT } from '@entities/Dataplane';
import { DATAPLANE_FIXTURE } from '@entities/Dataplane/__tests__/Dataplane.fixture';
import { createDataplaneMock } from '@entities/Dataplane/__tests__/Dataplane.handlers';
import { DEVICE_ENDPOINT } from '@entities/Device';
import { DEVICES_FIXTURE } from '@entities/Device/__tests__/Device.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { DeviceRouteBar, useDeviceRouteTransaction } from '@features/Device/DeviceRoute';
import { MS_IN_SECOND, SECONDS_IN_HOUR, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { DevicesPage } from '../ui/DevicesPage';

/** Dataplane model with a change and the daemon status that serves this change. */
function serveDataplane(initial = DATAPLANE_FIXTURE) {
  const mock = createDataplaneMock(initial);

  server.use(...createStatefulDaemonHandlers(mock.status), ...mock.handlers);
}

/** Base UI draws the toggle as a `span`: unavailability is visible by `aria-disabled`, not by `disabled`. */
function isLocked(toggle: HTMLElement): boolean {
  return toggle.getAttribute('aria-disabled') === 'true';
}

/** The device toggle when the model is read and it became available. */
async function readySwitch(device: string): Promise<HTMLElement> {
  const toggle = await screen.findByRole('switch', { name: `Через sing-box: ${device}` });

  await waitFor(() => {
    expect(isLocked(toggle)).toBe(false);
  });

  return toggle;
}

/** The device toggle when the model is read and it shows interception. */
async function readySwitchChecked(device: string): Promise<HTMLElement> {
  const toggle = await screen.findByRole('switch', { name: `Через sing-box: ${device}` });

  await waitFor(() => {
    expect(toggle).toBeChecked();
  });

  return toggle;
}

/** The confirmation bar lives in the shell: the screen is rendered next to it, as the shell does. */
function DevicesWithRouteBar() {
  const route = useDeviceRouteTransaction();

  return (
    <>
      <DevicesPage />
      <DeviceRouteBar transaction={route.transaction} isConfirming={route.isConfirming} onConfirm={route.confirm} />
    </>
  );
}

function renderScreen() {
  return renderWithRouter(DevicesWithRouteBar, { path: '/devices' });
}

function rowOf(label: string): HTMLElement {
  const row = screen.getAllByRole('row').find((item) => within(item).queryByText(label) !== null);

  if (row === undefined) {
    throw new Error(`Строки «${label}» нет в таблице`);
  }

  return row;
}

/** End of the dynamic lease from the fixture, in milliseconds. */
const LEASE_END = DEVICES_FIXTURE.devices[0].lease_expires * MS_IN_SECOND;

describe('devices screen', () => {
  beforeEach(() => {
    serveDataplane();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows devices with label, address, MAC, lease and network', async () => {
    server.use(...createDeviceHandlers());

    renderScreen();

    await screen.findByText('Ноутбук');

    const laptop = rowOf('Ноутбук');

    expect(within(laptop).getByText('192.168.1.60')).toBeInTheDocument();
    expect(within(laptop).getByText('aa:bb:cc:00:00:70')).toBeInTheDocument();
    expect(within(laptop).getByText('статическая')).toBeInTheDocument();
    expect(within(laptop).getByText('в сети')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Откуда имя' })).not.toBeInTheDocument();

    // Without a name the device is labeled by address, without an address it is named so in words.
    expect(within(rowOf('aa:bb:cc:00:00:40')).getAllByText('192.168.1.36')).toHaveLength(2);
    expect(within(rowOf('Принтер')).getByText('без адреса')).toBeInTheDocument();
    expect(screen.getByText('5 устройств')).toBeInTheDocument();
  });

  it('names the name source at the name itself, not in a separate column', async () => {
    server.use(...createDeviceHandlers());

    renderScreen();

    expect(await screen.findByRole('button', { name: 'Переименовать Ноутбук' })).toHaveAccessibleDescription(
      'имя задано в панели'
    );
    expect(screen.getByRole('button', { name: 'Переименовать tv-living' })).toHaveAccessibleDescription(
      'имя из статической аренды'
    );
    expect(screen.getByRole('button', { name: 'Переименовать iphone-guest' })).toHaveAccessibleDescription(
      'имя сообщило устройство'
    );
    expect(within(rowOf('iphone-guest')).getByText('iphone-guest')).toHaveAttribute('title', 'имя сообщило устройство');
    // Without a name there is nothing to explain: the row is labeled by address.
    expect(screen.getByRole('button', { name: 'Переименовать 192.168.1.36' })).not.toHaveAccessibleDescription();
  });

  it('for a dynamic lease shows the remaining term, for a static one and without a lease it does not', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(LEASE_END - (3 * SECONDS_IN_HOUR + 10 * SECONDS_IN_MINUTE) * MS_IN_SECOND);
    server.use(...createDeviceHandlers());

    renderScreen();

    await screen.findByText('Ноутбук');

    const dynamic = rowOf('iphone-guest');

    expect(within(dynamic).getByText('динамическая')).toHaveAttribute(
      'title',
      'Адрес выдан DHCP на срок аренды и после неё может смениться'
    );
    expect(within(dynamic).getByText('3 ч')).toHaveAttribute('datetime', new Date(LEASE_END).toISOString());
    expect(within(rowOf('Ноутбук')).getByText('статическая')).toHaveAttribute(
      'title',
      'Адрес закреплён за устройством в /etc/config/dhcp'
    );
    expect(within(rowOf('Ноутбук')).queryByText(/^ещё/)).not.toBeInTheDocument();
    expect(within(rowOf('Принтер')).getByText('динамическая')).toBeInTheDocument();
    expect(within(rowOf('Принтер')).queryByText(/^ещё/)).not.toBeInTheDocument();
  });

  it('links to the device connections filtered by its address', async () => {
    server.use(...createDeviceHandlers());

    renderScreen();

    const link = await screen.findByRole('link', { name: 'Соединения устройства Ноутбук' });

    expect(link).toHaveAttribute('href', '/connections?source=192.168.1.60');
    // There is no way to jump to the connections of a device without an address: the filter goes by IP.
    expect(within(rowOf('Принтер')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('renames a device and takes the list from the response instead of rereading it', async () => {
    const reads = vi.fn<() => void>();
    const renamed = vi.fn<(mac: string, body: unknown) => void>();
    const user = userEvent.setup();

    // Spies stand first and answer nothing: the request goes on to the daemon mock.
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
    expect(screen.getByRole('button', { name: 'Переименовать Телефон гостя' })).toHaveAccessibleDescription(
      'имя задано в панели'
    );
    expect(reads).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
      'Устройство теперь подписано «Телефон гостя»'
    );
  });

  it('an empty name clears its own, and the label returns to the address', async () => {
    const user = userEvent.setup();

    server.use(...createDeviceHandlers());
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Переименовать Ноутбук' }));
    await user.clear(screen.getByRole('textbox', { name: 'Своё имя для Ноутбук' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(screen.queryByText('Ноутбук')).not.toBeInTheDocument();
    });
    expect(
      within(rowOf('aa:bb:cc:00:00:70')).getByRole('button', { name: 'Переименовать 192.168.1.60' })
    ).not.toHaveAccessibleDescription();
  });

  it('does not send a name longer than the daemon ceiling and names the reason', async () => {
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

  it('Escape cancels the edit and restores the row', async () => {
    const user = userEvent.setup();

    server.use(...createDeviceHandlers());
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Переименовать tv-living' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Переименовать tv-living' })).toBeInTheDocument();
  });

  it('an empty daemon response is called emptiness, not loading', async () => {
    server.use(http.get(DEVICE_ENDPOINT.devices(), () => HttpResponse.json({ devices: [] })));

    renderScreen();

    expect(await screen.findByText('Устройств не найдено')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('a daemon failure shows the reason and a retry, not an empty list', async () => {
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

  describe('"via sing-box" toggle', () => {
    it('shows the device as enabled by MAC in any case and by an address from source_ip', async () => {
      server.use(...createDeviceHandlers());
      renderScreen();

      expect(await screen.findByRole('switch', { name: 'Через sing-box: iphone-guest' })).toBeChecked();
      expect(await screen.findByRole('switch', { name: 'Через sing-box: tv-living' })).toBeChecked();
      expect(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' })).not.toBeChecked();

      expect(within(rowOf('iphone-guest')).getByText('по MAC')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Через sing-box: iphone-guest' })).toHaveAccessibleDescription(
        'MAC устройства записан в список перехвата'
      );
      expect(within(rowOf('tv-living')).getByText('по адресу')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' })).not.toHaveAccessibleDescription();
    });

    it('shows a device from a source_ip subnet as enabled, unavailable and names the subnet', async () => {
      server.use(...createDeviceHandlers());
      serveDataplane({
        ...DATAPLANE_FIXTURE,
        model: {
          ...DATAPLANE_FIXTURE.model,
          source_ip: [
            '192.168.1.36/32',
            '192.168.1.60/31',
            '192.168.1.64/29',
            '192.168.1.112/28',
            '192.168.1.128/26',
            '192.168.1.192/27',
          ],
          source_mac: [],
        },
      });
      renderScreen();

      const laptop = await readySwitchChecked('Ноутбук');

      expect(isLocked(laptop)).toBe(true);
      expect(within(rowOf('Ноутбук')).getByText('по подсети 192.168.1.60/31')).toBeInTheDocument();
      expect(laptop).toHaveAccessibleDescription(
        'Устройство входит в подсеть 192.168.1.60/31 из списка перехвата. Отдельно его не выключить: уберите или сузьте подсеть.'
      );
      expect(screen.getByRole('switch', { name: 'Через sing-box: iphone-guest' })).toBeChecked();
      expect(screen.getByRole('switch', { name: 'Через sing-box: tv-living' })).toBeChecked();

      // A /32 host does not count as a subnet: its toggle clears it.
      const host = await readySwitch('192.168.1.36');

      expect(host).toBeChecked();
      expect(within(rowOf('aa:bb:cc:00:00:40')).getByText('по адресу')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Через sing-box: Принтер' })).not.toBeChecked();
    });

    it('after the warning sends a model with the MAC in source_mac and opens the confirmation window', async () => {
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

      expect(dialog).toHaveTextContent('sing-box перезапустится, соединения всех устройств оборвутся');
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

      expect(bar).toHaveTextContent('Устройство переключено');
      expect(within(bar).getByRole('button', { name: 'Связь есть, оставить' })).toBeEnabled();
      // While a change awaits confirmation, a second cannot start.
      expect(isLocked(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' }))).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: 'Через sing-box: 192.168.1.36' })).toBeChecked();
      });
    });

    it('confirmation sends POST and closes the window', async () => {
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

    it('rollback shows at which step the change stopped, and the original error', async () => {
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

      expect(bar).toHaveTextContent('Подтверждения не было — прежняя настройка возвращена');
      expect(bar).toHaveTextContent('после перезапуска правила nft перехвата не стоят');
      expect(bar).toHaveTextContent('nft: нет цепочки metabox_prerouting');

      await user.click(within(bar).getByRole('button', { name: 'Скрыть' }));

      expect(screen.queryByRole('region', { name: 'Смена перехвата' })).not.toBeInTheDocument();
    });

    it('in the interception-for-all mode the toggle is unavailable and explains why', async () => {
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

    it('on a daemon with a foreign service the toggle is unavailable, shows the position and explains why', async () => {
      server.use(...createDeviceHandlers());
      serveDataplane({ ...DATAPLANE_FIXTURE, foreign_service: true });
      renderScreen();

      await screen.findByText('Ноутбук');
      await waitFor(() => {
        expect(within(rowOf('Ноутбук')).getByText('панель управляет не metabox-singbox')).toBeInTheDocument();
      });

      expect(isLocked(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' }))).toBe(true);
      expect(screen.getByRole('switch', { name: 'Через sing-box: Ноутбук' })).not.toBeChecked();
      expect(screen.getByRole('switch', { name: 'Через sing-box: iphone-guest' })).toBeChecked();
    });

    it('a change rejected by the daemon does not open the window and does not lock the toggle', async () => {
      const rejected = vi.fn<() => void>();
      const user = userEvent.setup();

      server.use(
        http.put(DATAPLANE_ENDPOINT.dataplane(), () => {
          rejected();

          return HttpResponse.json(
            { code: 'apply_in_progress', message: 'apply already in progress' },
            { status: 409 }
          );
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
