import { http, HttpResponse } from 'msw';

import { DEVICE_ENDPOINT } from '../api/Device.endpoints';
import type { DevicesWire } from '../api/Device.schema';
import { DEVICES_FIXTURE } from './Device.fixture';

/** Any MAC in the path: colons in it are encoded, and the `:mac` template would not accept them. */
const MAC_PATTERN = '*';

function toName(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return null;
  }

  return typeof body.name === 'string' ? body.name : null;
}

/**
 * Own names work as in the daemon: an empty one clears its own, and the label returns to
 * the static lease or DHCP. The source to return to is taken by the mock from
 * the original fixture.
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
 * Device handlers. State is in the factory closure: the test gets a clean list,
 * dev mode keeps the names until the page reloads.
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
