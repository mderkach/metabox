import { describe, expect, it } from 'vitest';

import { ClashProxiesSchema, type ClashProxiesWire } from '../api/Proxy.schema';
import { toProxyRuntime, withSelectedNode } from '../model/Proxy.adapter';
import { DELAY_STATE } from '../model/Proxy.model';
import { CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

describe('toProxyRuntime', () => {
  it('не показывает служебные группы Clash API', () => {
    const names = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.map((group) => group.name);

    expect(names).not.toContain('GLOBAL');
    expect(names).toEqual(['proxy', 'us', 'us-fallback']);
  });

  it('разрешает выбор узла только у селектора', () => {
    const groups = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups;

    expect(groups.find((group) => group.name === 'us-fallback')?.selectable).toBe(true);
    expect(groups.find((group) => group.name === 'proxy')?.selectable).toBe(false);
  });

  it('отмечает узел, который группа держит сейчас', () => {
    const group = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.find((item) => item.name === 'proxy');

    expect(group?.nodes.filter((node) => node.selected).map((node) => node.name)).toEqual(['sub-eu/eu-reality']);
  });

  it('различает быструю задержку, медленную и отказ', () => {
    const group = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.find((item) => item.name === 'proxy');
    const states = new Map(group?.nodes.map((node) => [node.name, node.delayState]));

    expect(states.get('sub-eu/eu-reality')).toBe(DELAY_STATE.Fast);
    expect(states.get('sub-nl/nl-reality')).toBe(DELAY_STATE.Slow);
  });

  it('считает 65535 отказом, а не задержкой', () => {
    const nodes = toProxyRuntime(CLASH_PROXIES_FIXTURE).standalone;

    expect(nodes.find((node) => node.name === 'sub-us/us-xhttp')?.delayState).toBe(DELAY_STATE.Failed);
  });

  it('не принимает список прокси массивом: Clash API отдаёт его словарём', () => {
    expect(ClashProxiesSchema.safeParse({ proxies: [] }).success).toBe(false);
  });
});

describe('конфиг без групп', () => {
  const flat: ClashProxiesWire = {
    proxies: {
      GLOBAL: { type: 'Fallback', name: 'GLOBAL', udp: true, history: [], now: 'direct', all: ['direct'] },
      direct: { type: 'Direct', name: 'direct', udp: true, history: [] },
      'vless-de': { type: 'VLESS', name: 'vless-de', udp: true, history: [{ time: '', delay: 120 }] },
    },
  };

  it('не выдаёт служебный GLOBAL за группу конфига', () => {
    expect(toProxyRuntime(flat).groups).toEqual([]);
  });

  it('показывает аутбаунды списком, включая direct', () => {
    expect(toProxyRuntime(flat).standalone.map((node) => node.name)).toEqual(['direct', 'vless-de']);
  });
});

describe('withSelectedNode', () => {
  it('переносит выбор на другой узел группы', () => {
    const other = CLASH_PROXIES_FIXTURE.proxies['proxy'].all?.find(
      (name) => name !== CLASH_PROXIES_FIXTURE.proxies['proxy'].now
    );

    const next = withSelectedNode(CLASH_PROXIES_FIXTURE, 'proxy', other ?? '');
    const selected = toProxyRuntime(next).groups.find((group) => group.name === 'proxy');

    expect(selected?.now).toBe(other);
    expect(selected?.nodes.filter((node) => node.selected).map((node) => node.name)).toEqual([other]);
  });

  it('возвращает снимок как есть, когда группы в нём нет: это гонка, а не ошибка', () => {
    expect(withSelectedNode(CLASH_PROXIES_FIXTURE, 'нет такой', 'direct')).toBe(CLASH_PROXIES_FIXTURE);
  });
});
