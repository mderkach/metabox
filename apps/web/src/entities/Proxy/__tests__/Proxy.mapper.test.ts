import { describe, expect, it } from 'vitest';

import type { ClashProxies } from '../api/Proxy.dto';
import { toProxyGroups, toStandaloneNodes } from '../model/Proxy.mapper';
import { DELAY_STATE } from '../model/Proxy.model';
import { CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

describe('toProxyGroups', () => {
  it('не показывает служебные группы Clash API', () => {
    const names = toProxyGroups(CLASH_PROXIES_FIXTURE).map((group) => group.name);

    expect(names).not.toContain('GLOBAL');
    expect(names).toEqual(['proxy', 'us', 'us-fallback']);
  });

  it('разрешает выбор узла только у селектора', () => {
    const groups = toProxyGroups(CLASH_PROXIES_FIXTURE);

    expect(groups.find((group) => group.name === 'us-fallback')?.selectable).toBe(true);
    expect(groups.find((group) => group.name === 'proxy')?.selectable).toBe(false);
  });

  it('отмечает узел, который группа держит сейчас', () => {
    const group = toProxyGroups(CLASH_PROXIES_FIXTURE).find((item) => item.name === 'proxy');

    expect(group?.nodes.filter((node) => node.selected).map((node) => node.name)).toEqual(['sub-eu/eu-reality']);
  });

  it('различает быструю задержку, медленную и отказ', () => {
    const group = toProxyGroups(CLASH_PROXIES_FIXTURE).find((item) => item.name === 'proxy');
    const states = new Map(group?.nodes.map((node) => [node.name, node.delayState]));

    expect(states.get('sub-eu/eu-reality')).toBe(DELAY_STATE.Fast);
    expect(states.get('sub-nl/nl-reality')).toBe(DELAY_STATE.Slow);
  });

  it('считает 65535 отказом, а не задержкой', () => {
    const nodes = toStandaloneNodes(CLASH_PROXIES_FIXTURE);

    expect(nodes.find((node) => node.name === 'sub-us/us-xhttp')?.delayState).toBe(DELAY_STATE.Failed);
  });

  it('пустой ответ не роняет разбор', () => {
    expect(toProxyGroups(undefined)).toEqual([]);
    expect(toStandaloneNodes(undefined)).toEqual([]);
  });
});

describe('конфиг без групп', () => {
  const flat: ClashProxies = {
    proxies: {
      GLOBAL: { type: 'Fallback', name: 'GLOBAL', udp: true, history: [], now: 'direct', all: ['direct'] },
      direct: { type: 'Direct', name: 'direct', udp: true, history: [] },
      'vless-de': { type: 'VLESS', name: 'vless-de', udp: true, history: [{ time: '', delay: 120 }] },
    },
  };

  it('не выдаёт служебный GLOBAL за группу конфига', () => {
    expect(toProxyGroups(flat)).toEqual([]);
  });

  it('показывает аутбаунды списком, включая direct', () => {
    expect(toStandaloneNodes(flat).map((node) => node.name)).toEqual(['direct', 'vless-de']);
  });
});
