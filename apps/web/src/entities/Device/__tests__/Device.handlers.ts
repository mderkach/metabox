import { http, HttpResponse } from 'msw';

import { DEVICE_ENDPOINT } from '../api/Device.endpoints';
import type { DevicesWire } from '../api/Device.schema';
import { DEVICES_FIXTURE } from './Device.fixture';

/** Любой MAC в пути: двоеточия в нём закодированы, и шаблон `:mac` их бы не принял. */
const MAC_PATTERN = '*';

function toName(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return null;
  }

  return typeof body.name === 'string' ? body.name : null;
}

/**
 * Свои имена — как у демона: пустое снимает своё, и подпись возвращается к
 * статической аренде или DHCP. Источник, к которому возвращаться, мок берёт из
 * исходной фикстуры.
 */
function withName(list: DevicesWire, mac: string, name: string): DevicesWire {
  return {
    devices: list.devices.map((device) => {
      if (device.mac !== mac) {
        return device;
      }

      if (name !== '') {
        return { ...device, name, name_source: 'custom' };
      }

      const original = DEVICES_FIXTURE.devices.find((item) => item.mac === mac);
      const fallback = original === undefined || original.name_source === 'custom' ? null : original;

      return { ...device, name: fallback?.name ?? '', name_source: fallback?.name_source ?? 'none' };
    }),
  };
}

/**
 * Ручки устройств. Состояние — в замыкании фабрики: тест получает чистый список,
 * дев-режим держит имена до перезагрузки страницы.
 */
export function createDeviceHandlers(initial: DevicesWire = DEVICES_FIXTURE) {
  let list = initial;

  return [
    http.get(DEVICE_ENDPOINT.devices(), () => HttpResponse.json(list)),
    http.put(DEVICE_ENDPOINT.device(MAC_PATTERN), async ({ request }) => {
      const path = new URL(request.url).pathname;
      const mac = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
      const name = toName(await request.json());

      if (name === null) {
        return HttpResponse.json({ code: 'device_invalid', message: 'тело не разобрано' }, { status: 400 });
      }

      list = withName(list, mac, name.trim());

      return HttpResponse.json(list);
    }),
  ];
}
