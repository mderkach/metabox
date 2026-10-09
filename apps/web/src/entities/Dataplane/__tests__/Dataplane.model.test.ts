import { describe, expect, it } from 'vitest';

import { toDataplane, toDataplaneChange } from '../model/Dataplane.adapter';
import { isDeviceRouted, withDeviceRoute, type RouteSource } from '../model/Dataplane.model';
import { DATAPLANE_FIXTURE } from './Dataplane.fixture';

const MODEL = toDataplane({ body: DATAPLANE_FIXTURE, etag: null }).model;

const DYNAMIC: RouteSource = { mac: 'aa:bb:cc:00:00:40', ip: '192.168.1.36', static: false };
const STATIC: RouteSource = { mac: 'aa:bb:cc:00:00:70', ip: '192.168.1.60', static: true };
const BY_MAC: RouteSource = { mac: 'aa:bb:cc:00:01:04', ip: '192.168.1.120', static: false };
const BY_IP: RouteSource = { mac: 'aa:bb:cc:00:01:60', ip: '192.168.1.180', static: true };

describe('isDeviceRouted', () => {
  it('узнаёт устройство по MAC без учёта регистра и по адресу без префикса', () => {
    expect(isDeviceRouted(MODEL, BY_MAC)).toBe(true);
    expect(isDeviceRouted(MODEL, BY_IP)).toBe(true);
    expect(isDeviceRouted(MODEL, DYNAMIC)).toBe(false);
  });

  it('узнаёт адрес, записанный подсетью из одного хоста, но не подсетью шире', () => {
    expect(isDeviceRouted({ ...MODEL, sourceIp: ['192.168.1.36/32'] }, DYNAMIC)).toBe(true);
    expect(isDeviceRouted({ ...MODEL, sourceIp: ['192.168.1.0/24'] }, DYNAMIC)).toBe(false);
  });

  it('устройство без адреса не совпадает с пустой записью', () => {
    expect(isDeviceRouted({ ...MODEL, sourceIp: [''] }, { ...DYNAMIC, ip: '' })).toBe(false);
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

  it('выключение снимает MAC в любом регистре и адрес в обоих видах', () => {
    const model = { ...MODEL, sourceIp: ['192.168.1.120', '192.168.1.120/32', '10.0.0.0/8'] };
    const next = withDeviceRoute(model, BY_MAC, false);

    expect(next.sourceMac).toEqual([]);
    expect(next.sourceIp).toEqual(['10.0.0.0/8']);
    expect(isDeviceRouted(next, BY_MAC)).toBe(false);
  });

  it('остальные поля модели уходят демону без изменений', () => {
    expect(toDataplaneChange(withDeviceRoute(MODEL, DYNAMIC, false))).toEqual({ model: DATAPLANE_FIXTURE.model });
  });
});
