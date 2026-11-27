import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { createStatefulDaemonHandlers } from '@entities/Daemon/__tests__/Daemon.handlers';
import { DATAPLANE_ENDPOINT } from '@entities/Dataplane';
import { DATAPLANE_FIXTURE } from '@entities/Dataplane/__tests__/Dataplane.fixture';
import { createDataplaneMock } from '@entities/Dataplane/__tests__/Dataplane.handlers';
import { getDevicesOptions } from '@entities/Device';
import { DEVICES_FIXTURE } from '@entities/Device/__tests__/Device.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';

import { DeviceRouteScope } from '../ui/DeviceRouteScope';

function serveScope(model = DATAPLANE_FIXTURE.model, applied = true) {
  const mock = createDataplaneMock({ model, applied });
  server.use(...createStatefulDaemonHandlers(mock.status), ...createDeviceHandlers(), ...mock.handlers);
  return mock;
}

describe('interception scope', () => {
  it('keeps the selected device after a stale write and previews untouched new selectors before retry', async () => {
    const mock = serveScope();
    const user = userEvent.setup();
    renderWithQuery(<DeviceRouteScope />);
    await user.click(await screen.findByText('Выбрать устройства'));
    await user.click(await screen.findByRole('checkbox', { name: /Ноутбук/ }));
    const review = screen.getByRole('button', { name: 'Проверить изменение охвата' });
    await user.click(review);
    const original = screen.getByRole('dialog');
    expect(within(original).getAllByText(/iphone-guest · AA:BB:CC:00:01:04/)).toHaveLength(2);
    expect(within(original).getByText('Ноутбук · 192.168.1.60/32')).toBeVisible();
    const offline = 'AA:BB:CC:00:02:77';
    mock.edit({ ...DATAPLANE_FIXTURE.model, source_mac: [offline], acl_mode: 'all', dns_hijack: false });
    await user.click(within(original).getByRole('button', { name: 'Применить перехват' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ваш выбор сохранён');
    expect(await screen.findByRole('checkbox', { name: new RegExp(offline) })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ноутбук/ })).toBeChecked();
    await waitFor(() => expect(review).toBeEnabled());
    await user.click(review);
    const fresh = screen.getByRole('dialog');
    expect(within(fresh).getByText(/Все устройства на настроенных/)).toBeVisible();
    expect(within(fresh).getByText(offline)).toBeVisible();
    expect(within(fresh).getByText('Ноутбук · 192.168.1.60/32')).toBeVisible();
    expect(within(fresh).queryByText(/iphone-guest/)).not.toBeInTheDocument();
    await user.click(within(fresh).getByRole('button', { name: 'Применить перехват' }));
    expect(await screen.findByText(/Уже применяется изменение/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Текущий охват' })).toHaveFocus());
    const response = await fetch(new URL(DATAPLANE_ENDPOINT.dataplane(), window.location.href));
    expect(await response.json()).toMatchObject({
      model: {
        ...DATAPLANE_FIXTURE.model,
        dns_hijack: false,
        source_ip: ['192.168.1.180', '192.168.1.60/32'],
        source_mac: [offline, 'aa:bb:cc:00:00:70'],
      },
    });
  });

  it('disables an empty list and requires an explicit all-device choice', async () => {
    serveScope({ ...DATAPLANE_FIXTURE.model, source_mac: [], source_ip: [] });
    const user = userEvent.setup();
    renderWithQuery(<DeviceRouteScope />);
    expect(await screen.findByRole('radio', { name: 'Выбранных устройств' })).toBeChecked();
    const review = screen.getByRole('button', { name: 'Проверить изменение охвата' });
    expect(review).toBeDisabled();
    expect(screen.getByText(/хотя бы одно устройство/)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Всех устройств' }));
    expect(review).toBeEnabled();
    await user.click(review);
    expect(within(screen.getByRole('dialog')).getByText('Ни одного устройства')).toBeVisible();
    expect(within(screen.getByRole('dialog')).getByText(/Все устройства на настроенных/)).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(review).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Сбросить выбор' }));
    expect(screen.getByRole('radio', { name: 'Выбранных устройств' })).toBeChecked();
    expect(review).toBeDisabled();
  });

  it('keeps the device label in a MAC-based preview and blocks a reassigned static address', async () => {
    serveScope();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <DeviceRouteScope />
      </QueryClientProvider>
    );
    await user.click(await screen.findByText('Выбрать устройства'));
    await user.click(await screen.findByRole('checkbox', { name: /192.168.1.36/ }));
    await user.click(screen.getByRole('checkbox', { name: /Ноутбук/ }));
    const review = screen.getByRole('button', { name: 'Проверить изменение охвата' });
    await user.click(review);
    expect(within(screen.getByRole('dialog')).getByText('192.168.1.36 · aa:bb:cc:00:00:40')).toBeVisible();
    act(() => {
      client.setQueryData(getDevicesOptions().queryKey, {
        devices: DEVICES_FIXTURE.devices.map((device) =>
          device.name === 'Ноутбук' ? { ...device, mac: 'aa:bb:cc:00:00:22' } : device
        ),
      });
    });
    expect(
      await within(screen.getByRole('dialog')).findByRole('button', { name: 'Применить перехват' })
    ).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alert')).toHaveTextContent('изменились данные об адресе');
    expect(review).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Сбросить выбор' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['disabled', { ...DATAPLANE_FIXTURE.model, enabled: false }, true, /Перехват выключен/],
    ['unknown scope', { ...DATAPLANE_FIXTURE.model, acl_mode: 'custom' }, true, /Этот режим перехвата/],
    ['advanced subnet', { ...DATAPLANE_FIXTURE.model, source_ip: ['192.168.0.0/16'] }, true, /В списке есть подсети/],
    [
      'address exclusions',
      { ...DATAPLANE_FIXTURE.model, source_mac_exclude: ['aa:bb:cc:dd:ee:ff'] },
      true,
      /Настроены исключения/,
    ],
    ['missing chains', DATAPLANE_FIXTURE.model, false, /не подтвердил наличие правил/],
  ] as const)('explains the read-only scope for %s', async (_name, model, applied, reason) => {
    serveScope(
      { ...model, source_ip: [...model.source_ip], source_mac_exclude: [...model.source_mac_exclude] },
      applied
    );
    renderWithQuery(<DeviceRouteScope />);
    expect(await screen.findByText(reason)).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Проверить изменение охвата' })).not.toBeInTheDocument();
  });

  it('locks the selection while a config apply awaits confirmation', async () => {
    serveScope();
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () =>
        HttpResponse.json({
          ...DAEMON_STATUS_FIXTURE,
          transaction: { id: 'other', phase: 'awaiting_confirm', window: 30_000_000_000 },
        })
      )
    );
    renderWithQuery(<DeviceRouteScope />);
    expect(await screen.findByText(/Уже применяется изменение/)).toBeVisible();
    expect(await screen.findByRole('radio', { name: 'Всех устройств' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Проверить изменение охвата' })).toBeDisabled();
  });
});
