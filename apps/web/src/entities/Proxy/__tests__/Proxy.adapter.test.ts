import { describe, expect, it } from 'vitest';

import { API_FAILURE, ApiError } from '@shared/api';

import { ClashProxiesSchema, type ClashProvidersWire, type ClashProxiesWire } from '../api/Proxy.schema';
import {
  isProbeFailure,
  toFailedProbes,
  toProxyProviders,
  toProxyRuntime,
  withSelectedNode,
} from '../model/Proxy.adapter';
import { DELAY_STATE, DELAY_TIMEOUT } from '../model/Proxy.model';
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

describe('failed probes', () => {
  const NODE = 'sub-eu/eu-xhttp';

  function withHistory(history: ClashProxiesWire['proxies'][string]['history']): ClashProxiesWire {
    return {
      proxies: { ...CLASH_PROXIES_FIXTURE.proxies, [NODE]: { ...CLASH_PROXIES_FIXTURE.proxies[NODE], history } },
    };
  }

  function nodeOf(runtime: ReturnType<typeof toProxyRuntime>) {
    return runtime.groups.find((group) => group.name === 'proxy')?.nodes.find((node) => node.name === NODE);
  }

  // The fork deletes the history of a node that did not answer and never stores 65535.
  it('marks a node failed when its last panel probe failed and the runtime dropped its history', () => {
    const node = nodeOf(toProxyRuntime(withHistory([]), new Set([NODE])));

    expect(node?.delayState).toBe(DELAY_STATE.Failed);
    expect(node?.delay).toBe(DELAY_TIMEOUT);
  });

  it('keeps a node without history and without a failed probe unchecked', () => {
    expect(nodeOf(toProxyRuntime(withHistory([])))?.delayState).toBe(DELAY_STATE.Unknown);
  });

  it('prefers a history entry that appeared after the failure', () => {
    const node = nodeOf(toProxyRuntime(withHistory([{ time: '2026-09-10T19:30:00Z', delay: 120 }]), new Set([NODE])));

    expect(node?.delayState).toBe(DELAY_STATE.Fast);
    expect(node?.delay).toBe(120);
  });

  it('takes the latest probe of a node', () => {
    const failed = toFailedProbes([
      { name: 'a', failed: true },
      { name: 'b', failed: false },
      { name: 'a', failed: false },
      { name: 'b', failed: true },
    ]);

    expect([...failed]).toEqual(['b']);
  });

  it.each([
    { kind: 'a Clash timeout', error: new ApiError(API_FAILURE.Response, 'Timeout', { status: 504 }), expected: true },
    {
      kind: 'a Clash probe error',
      error: new ApiError(API_FAILURE.Response, 'An error occurred in the delay test', { status: 503 }),
      expected: true,
    },
    {
      kind: 'a daemon refusal with a code',
      error: new ApiError(API_FAILURE.Response, 'sing-box is down', { status: 503, code: 'runtime_unavailable' }),
      expected: false,
    },
    {
      kind: 'a silent gateway',
      error: new ApiError(API_FAILURE.Unreachable, 'silent', { status: 502 }),
      expected: false,
    },
    { kind: 'a server error', error: new ApiError(API_FAILURE.Response, 'boom', { status: 500 }), expected: false },
    { kind: 'a foreign error', error: new Error('boom'), expected: false },
  ])('tells $kind as a node failure: $expected', ({ error, expected }) => {
    expect(isProbeFailure(error)).toBe(expected);
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
