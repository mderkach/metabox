import { ACCESS_MODE } from '../api/Dataplane.schema';

export type AccessMode = (typeof ACCESS_MODE)[number];

export const ACL_MODE = {
  All: 'all',
  Listed: 'listed',
} as const satisfies Record<string, AccessMode>;

/** Секция `metabox.dataplane`. Пишется целиком: поле, которого нет, демон читает нулём. */
export interface DataplaneModel {
  enabled: boolean;
  redirectPort: number;
  tproxyPort: number;
  dnsPort: number;
  dnsHijack: boolean;
  selfMark: number;
  tproxyMark: number;
  routeTable: number;
  /** Строка, а не `AccessMode`: режим, которого панель не знает, обратно уходит как пришёл. */
  aclMode: string;
  /** IPv4-адрес или подсеть. */
  sourceIp: readonly string[];
  sourceMac: readonly string[];
  lanInterface: readonly string[];
  wanProxyCidr: readonly string[];
  wanDirectCidr: readonly string[];
  ipv6: boolean;
}

export interface Dataplane {
  model: DataplaneModel;
  /** Отпечаток секции из `ETag`: с ним смена уходит в `If-Match`. */
  etag: string | null;
  /** Демон управляет не службой `metabox-singbox`: смену модели он отклонит, и тумблеры её не предлагают. */
  foreignService: boolean;
}

/** Источник трафика LAN, который можно пустить через sing-box. */
export interface RouteSource {
  mac: string;
  /** Пусто, когда адреса нет. */
  ip: string;
  /** Аренда статическая: адрес за устройством закреплён. */
  static: boolean;
}

const HOST_PREFIX = '/32';
const IPV4_BITS = 32;
const IPV4_OCTET_MAX = 255;
const IPV4_CIDR = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/;

/** IPv4-адрес или подсеть из `source_ip`; адрес — беззнаковое 32-битное число. */
export interface Ipv4Cidr {
  address: number;
  prefix: number;
}

/**
 * Запись `source_ip` в адрес и длину префикса; голый адрес — подсеть `/32`.
 * IPv6 и всё, что не разбирается как IPv4, — `null`: демон собирает устройства
 * из аренд DHCPv4, и сопоставлять с ними IPv6 нечего.
 */
export function parseIpv4Cidr(entry: string): Ipv4Cidr | null {
  const match = IPV4_CIDR.exec(entry);

  if (match === null) return null;

  // Необязательная группа без совпадения — `undefined`, хотя тип RegExp обещает строку.
  const [, address = '', length = ''] = match;
  const octets = address.split('.').map(Number);
  const prefix = length === '' ? IPV4_BITS : Number(length);

  if (octets.some((octet) => octet > IPV4_OCTET_MAX) || prefix > IPV4_BITS) return null;

  return { address: octets.reduce((value, octet) => value * (IPV4_OCTET_MAX + 1) + octet, 0), prefix };
}

/** Адрес попадает в подсеть. Биты хоста маска отбрасывает: `192.168.1.65/29` читается как `192.168.1.64/29`. */
export function cidrContains(cidr: Ipv4Cidr, address: number): boolean {
  if (cidr.prefix === 0) return true;

  const mask = (~0 << (IPV4_BITS - cidr.prefix)) >>> 0;

  return (cidr.address & mask) >>> 0 === (address & mask) >>> 0;
}

function sameMac(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Адрес записан в `source_ip` сам по себе или подсетью из одного хоста — демон принимает оба вида. */
function isHostOf(entry: string, ip: string): boolean {
  return ip !== '' && (entry === ip || entry === `${ip}${HOST_PREFIX}`);
}

/** Подсеть шире одного хоста, в которую входит адрес. */
function subnetOf(entries: readonly string[], ip: string): string | null {
  const address = parseIpv4Cidr(ip);

  if (address === null || address.prefix !== IPV4_BITS) return null;

  return (
    entries.find((entry) => {
      const cidr = parseIpv4Cidr(entry);

      return cidr !== null && cidr.prefix < IPV4_BITS && cidrContains(cidr, address.address);
    }) ?? null
  );
}

export const ROUTE_REASON = {
  Mac: 'mac',
  Host: 'host',
  Subnet: 'subnet',
} as const;

/** Почему устройство идёт через sing-box в режиме `listed`. */
export type RouteReason =
  | { kind: typeof ROUTE_REASON.Mac }
  | { kind: typeof ROUTE_REASON.Host }
  | { kind: typeof ROUTE_REASON.Subnet; subnet: string };

/**
 * Подсеть проверяется первой: устройство в ней остаётся в перехвате, даже если
 * снять его MAC и адрес, поэтому только она честно отвечает, можно ли
 * выключить устройство отдельно.
 */
export function routeReason(model: DataplaneModel, source: RouteSource): RouteReason | null {
  const subnet = subnetOf(model.sourceIp, source.ip);

  if (subnet !== null) return { kind: ROUTE_REASON.Subnet, subnet };

  if (model.sourceMac.some((mac) => sameMac(mac, source.mac))) return { kind: ROUTE_REASON.Mac };

  if (model.sourceIp.some((ip) => isHostOf(ip, source.ip))) return { kind: ROUTE_REASON.Host };

  return null;
}

/**
 * Модель с устройством в списке перехвата или без него.
 *
 * Включение пишет MAC: он переживает смену аренды DHCP, а адрес динамической
 * аренды через час может достаться другому устройству, и тот пошёл бы через
 * sing-box вместо этого. Адрес статической аренды закреплён за устройством,
 * поэтому пишется ещё и он: по MAC nft узнаёт только кадры, пришедшие в LAN
 * напрямую, а через повторитель или маршрутизируемый сегмент у пакета чужой
 * MAC и прежний IP. Запись, которая уже есть, не дублируется: в наборе nft
 * адрес рядом с той же подсетью `/32` даёт пересечение интервалов.
 *
 * Выключение снимает и MAC, и адрес в обоих видах — иначе устройство осталось
 * бы в перехвате по второй записи.
 */
export function withDeviceRoute(model: DataplaneModel, source: RouteSource, routed: boolean): DataplaneModel {
  const sourceMac = model.sourceMac.filter((mac) => !sameMac(mac, source.mac));
  const sourceIp = model.sourceIp.filter((ip) => !isHostOf(ip, source.ip));

  if (!routed) {
    return { ...model, sourceMac, sourceIp };
  }

  const withIp = source.static && source.ip !== '';

  return {
    ...model,
    sourceMac: [...sourceMac, source.mac],
    sourceIp: withIp ? [...sourceIp, `${source.ip}${HOST_PREFIX}`] : model.sourceIp,
  };
}
