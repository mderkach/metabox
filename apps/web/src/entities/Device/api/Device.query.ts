import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toDeviceIndex, toDevices } from '../model/Device.adapter';
import { EMPTY_DEVICE_INDEX, type DeviceIndex } from '../model/Device.model';
import { getDevices, renameDevice } from './Device.api';
import { DevicesSchema, type DevicesWire } from './Device.schema';

/**
 * Опрос списка. Чаще минуты не спрашиваем: каждый запрос запускает `uci` на
 * роутере, а аренда DHCP живёт часами.
 */
const DEVICES_POLL = CACHE_TIME.Minute;

export const DEVICE_QUERY = {
  all: ['device'] as const,
  list: () => [...DEVICE_QUERY.all, 'list'] as const,
} as const;

export function getDevicesOptions() {
  return queryOptions({
    queryKey: DEVICE_QUERY.list(),
    queryFn: async (context) => decodeResponse(DevicesSchema, await getDevices(context), 'devices'),
    // Наблюдателей у списка много — каждая ячейка источника, — и каждый новый
    // перечитывает протухший кэш. Свежесть в период опроса держит их в одном
    // запросе на минуту.
    staleTime: DEVICES_POLL,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'source.devices' },
  });
}

/**
 * Опрос ставит один потребитель на экран: таймер у каждого наблюдателя свой, и
 * два опрашивающих хука дали бы два запроса за период. Опрос гаснет на отказе —
 * иначе недоступная ручка сыпала бы тостом раз в минуту.
 */
function devicesPoll(enabled: boolean) {
  return {
    refetchInterval: (query: { state: { status: string } }) =>
      enabled && query.state.status !== 'error' ? DEVICES_POLL : false,
    refetchIntervalInBackground: false,
  };
}

/** Список устройств экрана «Устройства»: по адресу, без адреса — в конце. */
export function useDevices() {
  return useQuery({ ...getDevicesOptions(), ...devicesPoll(true), select: toDevices });
}

/**
 * Устройства по адресу — для подписи источника. Пока список не пришёл или не
 * разобран, индекс пуст и подпись остаётся адресом.
 */
export function useDeviceIndex({ poll = false }: { poll?: boolean } = {}): DeviceIndex {
  const query = useQuery({ ...getDevicesOptions(), ...devicesPoll(poll), select: toDeviceIndex });

  return query.data ?? EMPTY_DEVICE_INDEX;
}

/** Своё имя устройства: ответ — список целиком, им и заменяется кэш. */
export async function saveDeviceName({ mac, name }: { mac: string; name: string }): Promise<DevicesWire> {
  return decodeResponse(DevicesSchema, await renameDevice(mac, name), 'devices');
}
