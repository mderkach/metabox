import { describe, expect, it } from 'vitest';

import { toDataplane, toDataplaneChange } from '../model/Dataplane.adapter';
import {
  cidrContains,
  parseIpv4Cidr,
  ROUTE_REASON,
  routeReason,
  withDeviceRoute,
  type RouteSource,
} from '../model/Dataplane.model';
import { DATAPLANE_FIXTURE } from './Dataplane.fixture';

const MODEL = toDataplane({ body: DATAPLANE_FIXTURE, etag: null }).model;

const DYNAMIC: RouteSource = { mac: 'aa:bb:cc:00:00:40', ip: '192.168.1.36', static: false };
const STATIC: RouteSource = { mac: 'aa:bb:cc:00:00:70', ip: '192.168.1.60', static: true };
const BY_MAC: RouteSource = { mac: 'aa:bb:cc:00:01:04', ip: '192.168.1.120', static: false };
const BY_IP: RouteSource = { mac: 'aa:bb:cc:00:01:60', ip: '192.168.1.180', static: true };

/** Список перехвата с роутера владельца: почти вся сеть подсетями и один хост. */
const ROUTER_SOURCE_IP = [
  '192.168.1.36/32',
  '192.168.1.60/31',
  '192.168.1.64/29',
  '192.168.1.112/28',
  '192.168.1.128/26',
  '192.168.1.192/27',
];

function addressOf(ip: string): number {
  const cidr = parseIpv4Cidr(ip);

  if (cidr === null) {
    throw new Error(`${ip} не разбирается как IPv4`);
  }

  return cidr.address;
}

function contains(cidr: string, ip: string): boolean {
  const parsed = parseIpv4Cidr(cidr);

  return parsed !== null && cidrContains(parsed, addressOf(ip));
}

describe('parseIpv4Cidr', () => {
  it('читает подсеть, а голый адрес — подсетью из одного хоста', () => {
    expect(parseIpv4Cidr('192.168.1.64/29')).toEqual({ address: 0xc0_a8_01_48, prefix: 29 });
    expect(parseIpv4Cidr('192.168.1.36')).toEqual({ address: 0xc0_a8_01_28, prefix: 32 });
    expect(parseIpv4Cidr('255.255.255.255/0')).toEqual({ address: 0xff_ff_ff_ff, prefix: 0 });
  });

  it('отклоняет мусор, октет больше 255 и префикс длиннее 32', () => {
    expect(parseIpv4Cidr('')).toBeNull();
    expect(parseIpv4Cidr('router')).toBeNull();
    expect(parseIpv4Cidr('192.168.1')).toBeNull();
    expect(parseIpv4Cidr('192.168.1.256')).toBeNull();
    expect(parseIpv4Cidr('192.168.1.0/33')).toBeNull();
    expect(parseIpv4Cidr('192.168.1.0/')).toBeNull();
    expect(parseIpv4Cidr(' 192.168.1.0/24')).toBeNull();
  });

  it('IPv6 не разбирает', () => {
    expect(parseIpv4Cidr('fd00::/8')).toBeNull();
    expect(parseIpv4Cidr('::ffff:192.168.1.36')).toBeNull();
  });
});

describe('cidrContains', () => {
  it('узнаёт адрес внутри подсети и не узнаёт снаружи', () => {
    expect(contains('192.168.1.64/29', '192.168.1.72')).toBe(true);
    expect(contains('192.168.1.64/29', '192.168.1.79')).toBe(true);
    expect(contains('192.168.1.64/29', '192.168.1.80')).toBe(false);
    expect(contains('192.168.1.64/29', '192.168.1.71')).toBe(false);
  });

  it('/0 покрывает всё, /32 — ровно один адрес, /31 — два', () => {
    expect(contains('0.0.0.0/0', '10.1.2.3')).toBe(true);
    expect(contains('192.168.1.36/32', '192.168.1.36')).toBe(true);
    expect(contains('192.168.1.36/32', '192.168.1.41')).toBe(false);
    expect(contains('192.168.1.60/31', '192.168.1.71')).toBe(true);
    expect(contains('192.168.1.60/31', '192.168.1.72')).toBe(false);
  });

  it('биты хоста в адресе подсети не мешают', () => {
    expect(contains('192.168.1.65/29', '192.168.1.72')).toBe(true);
  });

  it('старший бит адреса не уводит сравнение в отрицательные числа', () => {
    expect(contains('224.0.0.0/4', '239.255.255.250')).toBe(true);
  });
});

describe('routeReason', () => {
  it('узнаёт устройство по MAC без учёта регистра и по адресу без префикса', () => {
    expect(routeReason(MODEL, BY_MAC)).toEqual({ kind: ROUTE_REASON.Mac });
    expect(routeReason(MODEL, BY_IP)).toEqual({ kind: ROUTE_REASON.Host });
    expect(routeReason(MODEL, DYNAMIC)).toBeNull();
  });

  it('адрес подсетью из одного хоста — запись устройства, подсеть шире — причина «подсеть»', () => {
    expect(routeReason({ ...MODEL, sourceIp: ['192.168.1.36/32'] }, DYNAMIC)).toEqual({ kind: ROUTE_REASON.Host });
    expect(routeReason({ ...MODEL, sourceIp: ['192.168.1.0/24'] }, DYNAMIC)).toEqual({
      kind: ROUTE_REASON.Subnet,
      subnet: '192.168.1.0/24',
    });
  });

  it('на списке с роутера ведёт через sing-box почти всю сеть, а не только хост /32', () => {
    const model = { ...MODEL, sourceIp: ROUTER_SOURCE_IP, sourceMac: [] };

    expect(routeReason(model, DYNAMIC)).toEqual({ kind: ROUTE_REASON.Host });
    expect(routeReason(model, STATIC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.60/31' });
    expect(routeReason(model, BY_MAC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.128/26' });
    expect(routeReason(model, BY_IP)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.192/27' });
    expect(routeReason(model, { ...DYNAMIC, ip: '192.168.1.41' })).toBeNull();
  });

  it('подсеть перекрывает MAC и адрес: выключить устройство отдельно нельзя', () => {
    const model = { ...MODEL, sourceIp: ['192.168.1.120/32', '192.168.1.128/26'] };

    expect(routeReason(model, BY_MAC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.128/26' });
    expect(routeReason(withDeviceRoute(model, BY_MAC, false), BY_MAC)).toEqual({
      kind: ROUTE_REASON.Subnet,
      subnet: '192.168.1.128/26',
    });
  });

  it('мусор и IPv6 в списке пропускает', () => {
    const model = { ...MODEL, sourceIp: ['garbage', 'fd00::/8', '192.168.1.0/24'], sourceMac: [] };

    expect(routeReason(model, DYNAMIC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.0/24' });
  });

  it('устройство без адреса не совпадает ни с пустой записью, ни с подсетью', () => {
    const model = { ...MODEL, sourceIp: ['', '0.0.0.0/0'], sourceMac: [] };

    expect(routeReason(model, { ...DYNAMIC, ip: '' })).toBeNull();
  });
});

describe('withDeviceRoute', () => {
  it('у динамической аренды пишет только MAC', () => {
    const next = withDeviceRoute(MODEL, DYNAMIC, true);

    expect(next.sourceMac).toEqual(['AA:BB:CC:00:01:04', 'aa:bb:cc:00:00:40']);
    expect(next.sourceIp).toEqual(['192.168.1.180']);
  });

  it('у статической аренды пишет MAC и адрес подсетью /32', () => {
    const next = withDeviceRoute(MODEL, STATIC, true);

    expect(next.sourceMac).toContain('aa:bb:cc:00:00:70');
    expect(next.sourceIp).toEqual(['192.168.1.180', '192.168.1.60/32']);
  });

  it('не дублирует адрес, уже записанный без префикса', () => {
    const next = withDeviceRoute(MODEL, BY_IP, true);

    expect(next.sourceIp).toEqual(['192.168.1.180/32']);
  });

  it('выключение снимает MAC в любом регистре и адрес в обоих видах, подсети не трогает', () => {
    const model = { ...MODEL, sourceIp: ['192.168.1.120', '192.168.1.120/32', '10.0.0.0/8'] };
    const next = withDeviceRoute(model, BY_MAC, false);

    expect(next.sourceMac).toEqual([]);
    expect(next.sourceIp).toEqual(['10.0.0.0/8']);
    expect(routeReason(next, BY_MAC)).toBeNull();
  });

  it('остальные поля модели уходят демону без изменений', () => {
    expect(toDataplaneChange(withDeviceRoute(MODEL, DYNAMIC, false))).toEqual({ model: DATAPLANE_FIXTURE.model });
  });
});
