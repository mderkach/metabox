import { describe, expect, it } from 'vitest';

import { ClashProxiesSchema, type ClashProvidersWire, type ClashProxiesWire } from '../api/Proxy.schema';
import { toProxyProviders, toProxyRuntime, withSelectedNode } from '../model/Proxy.adapter';
import { DELAY_STATE } from '../model/Proxy.model';
import { CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

describe('toProxyRuntime', () => {
  it('не показывает служебные группы Clash API', () => {
    const names = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.map((group) => group.name);

    expect(names).not.toContain('GLOBAL');
    expect(names).toEqual(['us-fallback', 'proxy', 'us']);
  });

  it('ставит селекторы первыми и не меняет порядок внутри вида', () => {
    const group = (name: string, type: string) => ({ type, name, udp: true, history: [], now: 'direct', all: [] });
    const wire: ClashProxiesWire = {
      proxies: {
        auto: group('auto', 'URLTest'),
        manual: group('manual', 'Selector'),
        backup: group('backup', 'Fallback'),
        streaming: group('streaming', 'Selector'),
      },
    };

    expect(toProxyRuntime(wire).groups.map((item) => item.name)).toEqual(['manual', 'streaming', 'auto', 'backup']);
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

describe('toProxyProviders', () => {
  function providerWith(patch: Partial<ClashProvidersWire['providers'][string]>): ClashProvidersWire {
    return { providers: { sub: { ...CLASH_PROVIDERS_FIXTURE.providers['sub-eu'], name: 'sub', ...patch } } };
  }

  it('разбирает дату обновления и оставляет исходную строку для разметки', () => {
    const [eu] = toProxyProviders(CLASH_PROVIDERS_FIXTURE);

    expect(eu.update).toEqual({ kind: 'at', at: new Date('2026-09-10T12:27:02Z'), raw: '2026-09-10T12:27:02Z' });
  });

  it.each(['0001-01-01T00:00:00Z', '1970-01-01T00:00:00Z'])(
    'нулевую дату %s считает «ни разу не обновлялась»',
    (raw) => {
      const [provider] = toProxyProviders(providerWith({ updatedAt: raw }));

      expect(provider.update).toEqual({ kind: 'never' });
    }
  );

  it('не разобранную как дату строку помечает неизвестной, а не «Invalid Date»', () => {
    const [provider] = toProxyProviders(providerWith({ updatedAt: 'вчера' }));

    expect(provider.update).toEqual({ kind: 'unknown', raw: 'вчера' });
  });

  it('складывает Upload и Download в использованный трафик и отдаёт лимит и срок', () => {
    const nl = toProxyProviders(CLASH_PROVIDERS_FIXTURE).find((provider) => provider.name === 'sub-nl');

    expect(nl?.usage).toEqual({ used: 12043221 + 904113355, total: 107374182400 });
    expect(nl?.expiresAt).toEqual(new Date(1796126400 * 1000));
  });

  it('без лимита отдаёт использованное с нулевым total, а нулевой Expire — как «не сообщён»', () => {
    const [eu] = toProxyProviders(CLASH_PROVIDERS_FIXTURE);

    expect(eu.usage).toEqual({ used: 748287807 + 36519368345, total: 0 });
    expect(eu.expiresAt).toBeNull();
  });

  it('без subscriptionInfo трафика и срока нет', () => {
    const [provider] = toProxyProviders(providerWith({ subscriptionInfo: undefined }));

    expect(provider.usage).toBeNull();
    expect(provider.expiresAt).toBeNull();
  });

  it('одни нули в subscriptionInfo не превращает в «0 из 0»', () => {
    const [provider] = toProxyProviders(
      providerWith({ subscriptionInfo: { Upload: 0, Download: 0, Total: 0, Expire: 0 } })
    );

    expect(provider.usage).toBeNull();
    expect(provider.expiresAt).toBeNull();
  });
});
