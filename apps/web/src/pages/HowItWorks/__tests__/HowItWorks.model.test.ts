import { describe, expect, it } from 'vitest';

import { ROUTE_KIND, type ConnectionRow } from '@entities/Connection';
import { toDeviceIndex } from '@entities/Device';
import type { ProxyGroup, ProxyProvider } from '@entities/Proxy';
import { ROUTE_MATCH, ROUTE_ORIGIN, type RouteExplanation } from '@entities/Route';

import { pickWalkCandidates, toConnectionWalk, WALK_KINDS } from '../model/HowItWorks.model';

const ROW: ConnectionRow = {
  id: 'connection',
  host: 'example.com:443',
  network: 'tcp',
  source: '192.168.1.60',
  rule: 'rule_set(media-sites)',
  action: 'route(media)',
  kind: ROUTE_KIND.Proxy,
  chain: ['media', 'auto', 'server-a'],
  upload: 0,
  download: 0,
  upRate: 0,
  downRate: 0,
  startedAt: 0,
  searchText: '',
};

const EXPLANATION: RouteExplanation = {
  connectionId: ROW.id,
  match: {
    origin: ROUTE_ORIGIN.Computed,
    kind: ROUTE_MATCH.Rule,
    index: 0,
    conditions: ROW.rule,
    action: ROW.action,
    reasonCode: null,
    reason: '',
  },
  chain: { origin: ROUTE_ORIGIN.Observed, nodes: ['server-a', 'auto', 'media'] },
  rules: [],
};

const GROUPS: ProxyGroup[] = [
  { name: 'media', type: 'Selector', selectable: true, now: 'different', nodes: [] },
  { name: 'auto', type: 'URLTest', selectable: false, now: 'server-b', nodes: [] },
];

const PROVIDER: ProxyProvider = {
  name: 'provider-one',
  nodes: 2,
  nodeNames: ['server-a', 'server-b'],
  update: { kind: 'never' },
  usage: null,
  expiresAt: null,
};

describe('pickWalkCandidates', () => {
  it('offers one example of each kind in order and keeps backups without reshuffling equally preferred rows', () => {
    const rows: ConnectionRow[] = [
      { ...ROW, id: 'group-ipv4', host: '192.0.2.4:443' },
      { ...ROW, id: 'server-ipv6', host: '[2001:db8::4]:443', chain: ['server-a'] },
      { ...ROW, id: 'direct', kind: ROUTE_KIND.Direct, chain: [] },
      { ...ROW, id: 'group-named' },
      { ...ROW, id: 'server-named', host: 'example.net', chain: ['server-b'] },
      { ...ROW, id: 'group-named-backup', host: 'example.org:443' },
      { ...ROW, id: 'bare-ipv6', host: '2001:db8::5' },
      { ...ROW, id: 'dns', kind: ROUTE_KIND.Dns, action: 'hijack-dns' },
      { ...ROW, id: 'sniff', kind: ROUTE_KIND.Other, action: 'sniff' },
      { ...ROW, id: 'block', kind: ROUTE_KIND.Block, action: 'reject' },
      { ...ROW, id: 'empty-proxy-chain', chain: [] },
    ];

    const candidates = pickWalkCandidates(rows);

    expect(WALK_KINDS.map((kind) => candidates[kind][0]?.id)).toEqual(['group-named', 'server-named', 'direct']);
    expect(candidates.group.map((row) => row.id)).toEqual([
      'group-named',
      'group-named-backup',
      'group-ipv4',
      'bare-ipv6',
    ]);
    expect(candidates.server.map((row) => row.id)).toEqual(['server-named', 'server-ipv6']);
    expect(candidates.direct.map((row) => row.id)).toEqual(['direct']);
    expect(rows[0].id).toBe('group-ipv4');
  });

  it('has no example of any kind in an empty snapshot', () => {
    expect(pickWalkCandidates([])).toEqual({ group: [], server: [], direct: [] });
  });
});

describe('toConnectionWalk', () => {
  it('names a known device and retains the destination supplied by the connection', () => {
    const devices = toDeviceIndex({
      devices: [
        {
          ip: ROW.source,
          mac: '01:23:45:67:89:ab',
          name: 'laptop',
          name_source: 'dhcp',
          lease_expires: 0,
          online: true,
          static: false,
        },
      ],
    });
    const walk = toConnectionWalk({ row: ROW, explanation: EXPLANATION, devices });

    expect(walk.device).toEqual({ address: ROW.source, label: 'laptop' });
    expect(walk.destination).toEqual({ host: ROW.host });
    expect(toConnectionWalk({ row: { ...ROW, host: '192.0.2.4:443' }, explanation: EXPLANATION })).toMatchObject({
      device: { address: ROW.source, label: ROW.source },
      destination: { host: '192.0.2.4:443' },
    });
  });

  it('uses the explanation chain to nest groups and show the server and its provider', () => {
    const walk = toConnectionWalk({
      row: { ...ROW, chain: ['different'] },
      explanation: EXPLANATION,
      groups: GROUPS,
      providers: [PROVIDER],
    });

    expect(walk.outbound).toEqual({
      origin: ROUTE_ORIGIN.Observed,
      kind: 'group',
      tag: 'media',
      group: {
        tag: 'media',
        type: 'Selector',
        picked: 'auto',
        group: { tag: 'auto', type: 'URLTest', picked: 'server-a', group: null },
      },
    });
    expect(walk.server).toEqual({
      origin: ROUTE_ORIGIN.Observed,
      kind: 'server',
      tag: 'server-a',
      provider: 'provider-one',
    });
    expect(EXPLANATION.chain.nodes).toEqual(['server-a', 'auto', 'media']);
  });

  it('retains an unknown outbound tag and does not turn a detour into groups', () => {
    const walk = toConnectionWalk({ row: ROW, explanation: EXPLANATION });

    expect(walk.outbound).toMatchObject({ tag: 'media', kind: 'unknown', group: null });
    expect(walk.server).toMatchObject({ tag: 'server-a', kind: 'server', provider: null });
  });

  it('recognizes a one-node outbound without assigning an ambiguous subscription', () => {
    const walk = toConnectionWalk({
      row: ROW,
      explanation: { ...EXPLANATION, chain: { origin: ROUTE_ORIGIN.Observed, nodes: ['server-a'] } },
      providers: [PROVIDER, { ...PROVIDER, name: 'provider-two' }],
    });

    expect(walk.outbound).toMatchObject({ kind: 'server', tag: 'server-a', group: null });
    expect(walk.server).toMatchObject({ kind: 'server', tag: 'server-a', provider: null });
  });

  it('keeps the selected member of a group whose type the panel does not know', () => {
    const walk = toConnectionWalk({
      row: ROW,
      explanation: { ...EXPLANATION, chain: { origin: ROUTE_ORIGIN.Observed, nodes: ['server-a', 'media'] } },
      groups: [{ ...GROUPS[0], type: 'FutureGroup' }],
    });

    expect(walk.outbound.group).toEqual({ tag: 'media', type: null, picked: 'server-a', group: null });
  });

  it('shows a direct exit and no server with the chain origin', () => {
    const walk = toConnectionWalk({
      row: { ...ROW, kind: ROUTE_KIND.Direct },
      explanation: { ...EXPLANATION, chain: { origin: ROUTE_ORIGIN.Computed, nodes: ['direct'] } },
    });

    expect(walk.outbound).toEqual({ origin: ROUTE_ORIGIN.Computed, kind: 'direct', tag: 'direct', group: null });
    expect(walk.server).toEqual({ origin: ROUTE_ORIGIN.Computed, kind: 'none', tag: null, provider: null });
  });

  it('does not claim a server when the observed chain is empty', () => {
    const walk = toConnectionWalk({
      row: ROW,
      explanation: { ...EXPLANATION, chain: { origin: ROUTE_ORIGIN.Unknown, nodes: [] } },
    });

    expect(walk.outbound).toMatchObject({ kind: 'unknown', origin: ROUTE_ORIGIN.Unknown, tag: null });
    expect(walk.server).toMatchObject({ kind: 'unknown', origin: ROUTE_ORIGIN.Unknown, tag: null });
  });

  it.each(['Media routing', 'media-sites → media'])(
    'shows the verified rule label %s with its number and services',
    (label) => {
      const verifiedRule = { label, position: 0, services: ['media-sites'], editorPosition: 0 };
      const walk = toConnectionWalk({ row: ROW, explanation: EXPLANATION, verifiedRule });

      expect(walk.rule).toEqual({
        origin: ROUTE_ORIGIN.Computed,
        kind: ROUTE_MATCH.Rule,
        conditions: ROW.rule,
        action: ROW.action,
        reasonCode: null,
        reason: '',
        verified: verifiedRule,
      });
    }
  );

  it('keeps the verified rule number when there is no proved editor position', () => {
    const verifiedRule = { label: 'Media routing', position: 0, services: [] };
    const walk = toConnectionWalk({ row: ROW, explanation: EXPLANATION, verifiedRule });

    expect(walk.rule.verified).toEqual(verifiedRule);
    expect(walk.rule.verified?.editorPosition).toBeUndefined();
  });

  it('retains only the conditions and action when the rule position is unverified', () => {
    const walk = toConnectionWalk({ row: ROW, explanation: EXPLANATION });

    expect(walk.rule).toMatchObject({ verified: null, conditions: ROW.rule, action: ROW.action });
    expect(walk.rule).not.toHaveProperty('index');
  });

  it.each([ROUTE_MATCH.Final, ROUTE_MATCH.Unknown])(
    'retains the %s rule without using verified rule details',
    (kind) => {
      const match = { ...EXPLANATION.match, kind, index: null, reason: 'The route could not be confirmed' };
      const walk = toConnectionWalk({
        row: ROW,
        explanation: { ...EXPLANATION, match },
        verifiedRule: { label: 'Media routing', position: 0, services: ['media-sites'] },
      });

      expect(walk.rule).toMatchObject({ kind, reason: match.reason, verified: null });
    }
  );
});
