import { afterEach, expect, it } from 'vitest';

import { ConfigDocumentStore, readSectionNodes } from '@entities/Config';

import { parseShareLink, shareLinkNode } from '../model/ConfigNodeAdd.link';
import { CONNECTION_LINK_DEFAULTS } from '../model/ConfigNodeAdd.schema';
import {
  SERVER_ERROR,
  SERVER_GROUP,
  serverGroups,
  serverImportMatch,
  stageServerImport,
} from '../model/ConfigNodeAdd.server';

const CREDENTIAL = 'b831381d-6324-4d53-ad4f-8cda48b30811';
const VLESS = `vless://${CREDENTIAL}@edge.example:443?security=reality&sni=front.example#candidate`;
const DRAFT_NODE = { ...CONNECTION_LINK_DEFAULTS, link: VLESS };

function parse(text: string) {
  const { link } = parseShareLink(text);
  if (link === null) throw new Error('Expected a supported test link');

  return link;
}

function config(...outbounds: object[]) {
  return JSON.stringify({ outbounds });
}

afterEach(() => {
  ConfigDocumentStore.getState().reset();
});

it.each([
  [VLESS, VLESS.replace('front.example', 'different.example')],
  [
    `vmess://${btoa(JSON.stringify({ id: CREDENTIAL, add: 'edge.example', port: '443', scy: 'aes-128-gcm' }))}`,
    `vmess://${btoa(JSON.stringify({ id: CREDENTIAL, add: 'edge.example', port: '443', scy: 'chacha20-poly1305' }))}`,
  ],
  [
    'trojan://fake-password@edge.example:443?type=ws&path=%2Ffirst',
    'trojan://fake-password@edge.example:443?type=ws&path=%2Fsecond',
  ],
  ['ss://aes-128-gcm:fake-password@edge.example:443', 'ss://aes-256-gcm:fake-password@edge.example:443'],
  [
    'hysteria2://fake-password@edge.example?obfs=salamander&obfs-password=first',
    'hy2://fake-password@edge.example:443?obfs=salamander&obfs-password=second',
  ],
])('compares the mapped settings of supported server links', (source, different) => {
  const link = parse(source);
  const existing = shareLinkNode(link, 'existing');
  const reversed = Object.fromEntries(Object.entries(existing).toReversed());

  expect(serverImportMatch(link, config(reversed), '{}')).toBe(SERVER_ERROR.Duplicate);
  expect(serverImportMatch(link, '{}', config(existing))).toBe(SERVER_ERROR.Duplicate);
  expect(serverImportMatch(parse(different), config(existing), '{}')).toBeNull();
});

it('stages only after an explicit decision when the existing server has extra settings', () => {
  const link = parse(VLESS);
  const state = ConfigDocumentStore.getState();
  const existing = { ...shareLinkNode(link, 'existing'), detour: 'custom-detour' };
  const configured = config(existing);
  expect(serverImportMatch(link, configured, '{}')).toBe(SERVER_ERROR.PossibleDuplicate);
  expect(serverImportMatch(link, '{}', configured)).toBe(SERVER_ERROR.PossibleDuplicate);
  state.load(configured);

  expect(stageServerImport(link, DRAFT_NODE)).toEqual({
    failure: { field: 'serverSeparate', message: SERVER_ERROR.PossibleDuplicate },
  });
  expect(ConfigDocumentStore.getState().draft).toBeNull();
  expect(stageServerImport(link, { ...DRAFT_NODE, serverSeparate: true })).toEqual({ tag: 'candidate' });
  expect(readSectionNodes(ConfigDocumentStore.getState().draft ?? '', 'outbounds')).toEqual([
    existing,
    shareLinkNode(link, 'candidate'),
  ]);
  expect(stageServerImport(link, { ...DRAFT_NODE, serverSeparate: true })).toEqual({
    failure: { field: 'root', message: SERVER_ERROR.Duplicate },
  });
});

it('lists only editable groups and stages the server and its membership together', () => {
  const state = ConfigDocumentStore.getState();
  const link = parse(VLESS);
  const eligible = { type: 'urltest', tag: 'fastest', outbounds: ['existing'], use_all_providers: true };
  const ineligible = [
    { type: 'direct', tag: 'direct' },
    { type: 'fallback', tag: 'fallback', outbounds: [] },
    { type: 'selector', tag: 'invalid', outbounds: 'existing' },
    { type: 'selector', tag: 'duplicate', outbounds: [] },
    { type: 'selector', tag: 'duplicate', outbounds: [] },
  ];
  const applied = config(eligible, ...ineligible).replace(
    '["existing"]',
    '[\n    // Keep the configured member.\n    "existing"\n  ]'
  );
  state.load(applied);
  expect(serverGroups(applied).map(({ label }) => label)).toEqual(['fastest']);
  expect(stageServerImport(link, { ...DRAFT_NODE, serverGroup: 'tag:invalid' })).toEqual({
    failure: { field: 'serverGroup', message: SERVER_ERROR.GroupUnavailable },
  });
  expect(ConfigDocumentStore.getState().draft).toBeNull();
  const writes: (string | null)[] = [];
  const unsubscribe = ConfigDocumentStore.subscribe(({ draft }) => writes.push(draft));
  try {
    expect(stageServerImport(link, { ...DRAFT_NODE, serverGroup: 'tag:fastest' })).toEqual({ tag: 'candidate' });
  } finally {
    unsubscribe();
  }

  expect(writes).toEqual([ConfigDocumentStore.getState().draft]);
  expect(writes[0]).toContain('// Keep the configured member.');
  expect(readSectionNodes(writes[0] ?? '', 'outbounds')).toEqual([
    { ...eligible, outbounds: ['existing', 'candidate'] },
    ...ineligible,
    shareLinkNode(link, 'candidate'),
  ]);
  expect(ConfigDocumentStore.getState().applied).toBe(applied);
});

it('creates a new manual group without reusing server or configuration tags', () => {
  const state = ConfigDocumentStore.getState();
  const link = parse(VLESS);
  const applied = '{"endpoints":[{"type":"wireguard","tag":"existing"}]}';
  state.load(applied);
  const data = { ...DRAFT_NODE, serverGroup: SERVER_GROUP.New };

  for (const serverGroupName of ['existing', 'candidate']) {
    expect(stageServerImport(link, { ...data, serverGroupName })).toEqual({
      failure: { field: 'serverGroupName', message: SERVER_ERROR.GroupTaken },
    });
  }
  expect(ConfigDocumentStore.getState().draft).toBeNull();
  expect(stageServerImport(link, { ...data, serverGroupName: 'manual' })).toEqual({ tag: 'candidate' });
  expect(readSectionNodes(ConfigDocumentStore.getState().draft ?? '', 'outbounds')).toEqual([
    shareLinkNode(link, 'candidate'),
    { type: 'selector', tag: 'manual', outbounds: ['candidate'] },
  ]);
});

it.each(['[]', '{"outbounds":{"tag":"unsupported-shape"}}'])(
  'preserves a draft with an invalid outbound layout: %s',
  (draft) => {
    const state = ConfigDocumentStore.getState();
    state.load('{}');
    state.replace(draft);

    expect(stageServerImport(parse(VLESS), DRAFT_NODE)).toEqual({
      failure: { field: 'root', message: SERVER_ERROR.Write },
    });
    expect(ConfigDocumentStore.getState().draft).toBe(draft);
  }
);
