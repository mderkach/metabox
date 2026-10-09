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

function sameMac(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Адрес записан в `source_ip` сам по себе или подсетью из одного хоста — демон принимает оба вида. */
function isHostOf(entry: string, ip: string): boolean {
  return ip !== '' && (entry === ip || entry === `${ip}${HOST_PREFIX}`);
}

/**
 * Устройство идёт через sing-box по своей записи: MAC в `source_mac` или его
 * адрес в `source_ip`. Подсеть шире одного хоста записью устройства не
 * считается — тумблер её не пишет и снять не может.
 */
export function isDeviceRouted(model: DataplaneModel, source: RouteSource): boolean {
  return (
    model.sourceMac.some((mac) => sameMac(mac, source.mac)) || model.sourceIp.some((ip) => isHostOf(ip, source.ip))
  );
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
