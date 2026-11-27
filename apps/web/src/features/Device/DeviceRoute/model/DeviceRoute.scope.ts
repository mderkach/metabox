import {
  ACL_MODE,
  isRouted,
  routeReason,
  withDeviceRoute,
  type DataplaneModel,
  type RouteSource,
} from '@entities/Dataplane';
import type { Device } from '@entities/Device';
import { IPV4_HOST_PREFIX, parseIpv4Cidr } from '@shared/lib/ipv4';

export interface ScopeDevice extends RouteSource {
  key: string;
  label: string;
  missing: boolean;
}

export interface ScopeEdit {
  device: ScopeDevice;
  checked: boolean;
}

export function scopeRestriction(model: DataplaneModel, etag: string | null, applied: boolean, managed: boolean) {
  if (!model.enabled) return 'disabled' as const;
  if (model.aclMode !== ACL_MODE.All && model.aclMode !== ACL_MODE.Listed) return 'unknown' as const;
  if (model.sourceIpExclude.length || model.sourceMacExclude.length) return 'exclusions' as const;
  if (model.sourceIp.some((ip) => parseIpv4Cidr(ip)?.prefix !== IPV4_HOST_PREFIX)) return 'subnets' as const;
  if (etag === null || !/^"[^"]+"$/.test(etag)) return 'version' as const;
  if (!applied) return 'chains' as const;
  if (!managed) return 'service' as const;
  return null;
}

function host(entry: string) {
  return entry.split('/')[0] ?? entry;
}

/** Saved selectors stay available even when the router no longer has a DHCP lease for them. */
export function scopeDevices(
  model: DataplaneModel,
  devices: readonly Device[],
  edits: readonly ScopeEdit[]
): ScopeDevice[] {
  const rows = devices.map((device) => ({ ...device, key: device.mac, missing: false }));
  const result: ScopeDevice[] = [...rows];
  const macs = new Set(rows.map((device) => device.mac));
  const ips = new Set(rows.map((device) => device.ip));

  for (const { device } of edits) {
    if (!device.missing && !macs.has(device.mac)) {
      result.push({ ...device, missing: true });
      macs.add(device.mac);
      ips.add(device.ip);
    }
  }
  for (const mac of model.sourceMac) {
    const key = mac.toLowerCase();
    if (!macs.has(key)) result.push({ key, mac, ip: '', static: false, label: mac, missing: true });
  }
  for (const entry of model.sourceIp) {
    const ip = host(entry);
    if (!ips.has(ip)) result.push({ key: ip, mac: '', ip, static: true, label: entry, missing: true });
  }
  return result;
}

export function deviceSelected(model: DataplaneModel, device: ScopeDevice) {
  return isRouted(routeReason(model, device));
}

/** An old lease must not enroll or remove a different device after an inventory refresh. */
export function conflictingLease(edits: readonly ScopeEdit[], devices: readonly Device[]): ScopeDevice | undefined {
  return edits.find(({ device, checked }) => {
    if (device.missing || device.ip === '' || (checked && !device.static)) return false;
    const peer = devices.find((item) => item.mac === device.mac);
    return (
      devices.some((item) => item.ip === device.ip && item.mac !== device.mac) ||
      (checked && (peer?.static !== true || peer.ip !== device.ip))
    );
  })?.device;
}

/** Replay only deliberate edits over the latest section; selecting all keeps its dormant source lists intact. */
export function proposedScope(model: DataplaneModel, mode: string, edits: readonly ScopeEdit[]): DataplaneModel {
  const scoped = { ...model, aclMode: mode };
  if (mode === ACL_MODE.All) return scoped;
  return edits.reduce(
    (next, { device, checked }) =>
      deviceSelected(next, device) === checked ? next : withDeviceRoute(next, device, checked),
    scoped
  );
}

/** The two selectors can identify the same device. Keep both in the preview to show precisely what gets written. */
export function scopeEntries(model: DataplaneModel, devices: readonly Device[]): string[] {
  const entries: string[] = [];
  for (const mac of model.sourceMac) {
    const name = devices.find((device) => device.mac === mac.toLowerCase())?.label;
    entries.push(name !== undefined && name.toLowerCase() !== mac.toLowerCase() ? `${name} · ${mac}` : mac);
  }
  for (const entry of model.sourceIp) {
    const name = devices.find((device) => device.ip === host(entry))?.label;
    entries.push(name !== undefined && name !== host(entry) ? `${name} · ${entry}` : entry);
  }
  return entries;
}
