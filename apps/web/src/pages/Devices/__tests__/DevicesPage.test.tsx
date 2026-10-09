import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { DEVICE_ENDPOINT } from '@entities/Device';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';

import { DevicesPage } from '../ui/DevicesPage';

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
});
