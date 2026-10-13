import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toDeviceIndex, toDevices } from '../model/Device.adapter';
import { EMPTY_DEVICE_INDEX, type DeviceIndex } from '../model/Device.model';
import { getDevices, renameDevice } from './Device.api';
import { DevicesSchema, type DevicesWire } from './Device.schema';

/**
 * List polling. We do not ask more often than a minute: each request runs `uci`
 * on the router, and a DHCP lease lives for hours.
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
    // The list has many observers, every source cell, and each new one rereads
    // a stale cache. Freshness equal to the polling period keeps them in one
    // request per minute.
    staleTime: DEVICES_POLL,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'source.devices' },
  });
}

/**
 * Polling is set by one consumer per screen: each observer has its own timer,
 * and two polling hooks would give two requests per period. Polling stops on
 * failure, otherwise an unavailable endpoint would spray a toast once a minute.
 */
function devicesPoll(enabled: boolean) {
  return {
    refetchInterval: (query: { state: { status: string } }) =>
      enabled && query.state.status !== 'error' ? DEVICES_POLL : false,
    refetchIntervalInBackground: false,
  };
}

/** Device list for the "Devices" screen: by address, those without an address at the end. */
export function useDevices() {
  return useQuery({ ...getDevicesOptions(), ...devicesPoll(true), select: toDevices });
}

/**
 * Devices by address, for the source label. While the list has not arrived or
 * was not parsed, the index is empty and the label stays the address.
 */
export function useDeviceIndex({ poll = false }: { poll?: boolean } = {}): DeviceIndex {
  const query = useQuery({ ...getDevicesOptions(), ...devicesPoll(poll), select: toDeviceIndex });

  return query.data ?? EMPTY_DEVICE_INDEX;
}

/** Device's own name: the response is the whole list, and it replaces the cache. */
export async function saveDeviceName({ mac, name }: { mac: string; name: string }): Promise<DevicesWire> {
  return decodeResponse(DevicesSchema, await renameDevice(mac, name), 'devices');
}
