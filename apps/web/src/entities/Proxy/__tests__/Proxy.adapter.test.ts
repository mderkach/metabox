import { describe, expect, it } from 'vitest';

import { ClashProxiesSchema, type ClashProvidersWire, type ClashProxiesWire } from '../api/Proxy.schema';
import { toProxyProviders, toProxyRuntime, withSelectedNode } from '../model/Proxy.adapter';
import { DELAY_STATE } from '../model/Proxy.model';
import { CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

describe('toProxyRuntime', () => {
  it('does not show Clash API service groups', () => {
    const names = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.map((group) => group.name);

    expect(names).not.toContain('GLOBAL');
    expect(names).toEqual(['us-fallback', 'proxy', 'us']);
  });

  it('puts selectors first and does not change the order within a kind', () => {
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

  it('allows node selection only on a selector', () => {
    const groups = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups;

    expect(groups.find((group) => group.name === 'us-fallback')?.selectable).toBe(true);
    expect(groups.find((group) => group.name === 'proxy')?.selectable).toBe(false);
  });

  it('marks the node the group holds now', () => {
    const group = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.find((item) => item.name === 'proxy');

    expect(group?.nodes.filter((node) => node.selected).map((node) => node.name)).toEqual(['sub-eu/eu-reality']);
  });

  it('tells fast latency, slow and failure apart', () => {
    const group = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups.find((item) => item.name === 'proxy');
    const states = new Map(group?.nodes.map((node) => [node.name, node.delayState]));

    expect(states.get('sub-eu/eu-reality')).toBe(DELAY_STATE.Fast);
    expect(states.get('sub-nl/nl-reality')).toBe(DELAY_STATE.Slow);
  });

  it('counts 65535 as a failure, not a latency', () => {
    const nodes = toProxyRuntime(CLASH_PROXIES_FIXTURE).standalone;

    expect(nodes.find((node) => node.name === 'sub-us/us-xhttp')?.delayState).toBe(DELAY_STATE.Failed);
  });

  it('does not accept a proxy list as an array: Clash API serves it as a dictionary', () => {
    expect(ClashProxiesSchema.safeParse({ proxies: [] }).success).toBe(false);
  });
});

describe('config without groups', () => {
  const flat: ClashProxiesWire = {
    proxies: {
      GLOBAL: { type: 'Fallback', name: 'GLOBAL', udp: true, history: [], now: 'direct', all: ['direct'] },
      direct: { type: 'Direct', name: 'direct', udp: true, history: [] },
      'vless-de': { type: 'VLESS', name: 'vless-de', udp: true, history: [{ time: '', delay: 120 }] },
    },
  };

  it('does not pass the service GLOBAL off as a config group', () => {
    expect(toProxyRuntime(flat).groups).toEqual([]);
  });

  it('shows outbounds as a list, including direct', () => {
    expect(toProxyRuntime(flat).standalone.map((node) => node.name)).toEqual(['direct', 'vless-de']);
  });
});

describe('withSelectedNode', () => {
  it('moves the selection to another node of the group', () => {
    const other = CLASH_PROXIES_FIXTURE.proxies['proxy'].all?.find(
      (name) => name !== CLASH_PROXIES_FIXTURE.proxies['proxy'].now
    );

    const next = withSelectedNode(CLASH_PROXIES_FIXTURE, 'proxy', other ?? '');
    const selected = toProxyRuntime(next).groups.find((group) => group.name === 'proxy');

    expect(selected?.now).toBe(other);
    expect(selected?.nodes.filter((node) => node.selected).map((node) => node.name)).toEqual([other]);
  });

  it('returns the snapshot as is when it has no group: this is a race, not an error', () => {
    expect(withSelectedNode(CLASH_PROXIES_FIXTURE, 'нет такой', 'direct')).toBe(CLASH_PROXIES_FIXTURE);
  });
});

describe('toProxyProviders', () => {
  function providerWith(patch: Partial<ClashProvidersWire['providers'][string]>): ClashProvidersWire {
    return { providers: { sub: { ...CLASH_PROVIDERS_FIXTURE.providers['sub-eu'], name: 'sub', ...patch } } };
  }

  it('parses the update date and keeps the original string for markup', () => {
    const [eu] = toProxyProviders(CLASH_PROVIDERS_FIXTURE);

    expect(eu.update).toEqual({ kind: 'at', at: new Date('2026-09-10T12:27:02Z'), raw: '2026-09-10T12:27:02Z' });
  });

  it.each(['0001-01-01T00:00:00Z', '1970-01-01T00:00:00Z'])('treats the zero date %s as "never updated"', (raw) => {
    const [provider] = toProxyProviders(providerWith({ updatedAt: raw }));

    expect(provider.update).toEqual({ kind: 'never' });
  });

  it('marks a string not parsed as a date as unknown, not "Invalid Date"', () => {
    const [provider] = toProxyProviders(providerWith({ updatedAt: 'вчера' }));

    expect(provider.update).toEqual({ kind: 'unknown', raw: 'вчера' });
  });

  it('adds Upload and Download into used traffic and returns the limit and expiry', () => {
    const nl = toProxyProviders(CLASH_PROVIDERS_FIXTURE).find((provider) => provider.name === 'sub-nl');

    expect(nl?.usage).toEqual({ used: 12043221 + 904113355, total: 107374182400 });
    expect(nl?.expiresAt).toEqual(new Date(1796126400 * 1000));
  });

  it('without a limit returns used with a zero total, and a zero Expire as "not reported"', () => {
    const [eu] = toProxyProviders(CLASH_PROVIDERS_FIXTURE);

    expect(eu.usage).toEqual({ used: 748287807 + 36519368345, total: 0 });
    expect(eu.expiresAt).toBeNull();
  });

  it('without subscriptionInfo there is no traffic and expiry', () => {
    const [provider] = toProxyProviders(providerWith({ subscriptionInfo: undefined }));

    expect(provider.usage).toBeNull();
    expect(provider.expiresAt).toBeNull();
  });

  it('does not turn all zeros in subscriptionInfo into "0 of 0"', () => {
    const [provider] = toProxyProviders(
      providerWith({ subscriptionInfo: { Upload: 0, Download: 0, Total: 0, Expire: 0 } })
    );

    expect(provider.usage).toBeNull();
    expect(provider.expiresAt).toBeNull();
  });
});
