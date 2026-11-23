import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentStore, findValue } from '@entities/Config';

import { CONNECTION_LINK_DEFAULTS, makeConnectionLinkSchema } from '../model/ConfigNodeAdd.schema';
import {
  MAX_INTERVAL,
  stageSubscription,
  SUBSCRIPTION_ERROR,
  SUBSCRIPTION_GROUP,
  subscriptionGroups,
} from '../model/ConfigNodeAdd.subscription';

const URL = 'https://user:mock-password@provider.example.invalid/path?token=mock-token';
const COMMON = { ...CONNECTION_LINK_DEFAULTS, link: URL, tag: 'fresh' };

describe('subscription staging', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  it('rejects cache tags from the base or draft before writing, including numeric defaults', () => {
    const state = ConfigDocumentStore.getState();
    state.load('{"providers":[{"type":"remote"}],"endpoints":[{"type":"wireguard","tag":"endpoint"}]}');
    const draft = '{"route":{"rule_set":[{"type":"local","tag":"draft-rule-set"}]}}';
    state.replace(draft);

    for (const tag of ['0', 'endpoint', 'draft-rule-set']) {
      expect(stageSubscription({ ...COMMON, tag })).toEqual({
        field: 'tag',
        message: SUBSCRIPTION_ERROR.TagTaken,
      });
      expect(ConfigDocumentStore.getState().draft).toBe(draft);
    }
  });

  it('leaves the draft intact when the selected group disappears or the base changes', () => {
    const state = ConfigDocumentStore.getState();
    state.load('{}');
    expect(stageSubscription({ ...COMMON, group: 'tag:missing' })).toEqual({
      field: 'group',
      message: SUBSCRIPTION_ERROR.GroupUnavailable,
    });
    expect(ConfigDocumentStore.getState().draft).toBeNull();

    const draft = '{"outbounds":[]}';
    state.replace(draft);
    state.load('{"outbounds":[{"type":"direct","tag":"direct"}]}');
    expect(stageSubscription(COMMON)).toEqual({ field: 'root', message: SUBSCRIPTION_ERROR.Stale });
    expect(ConfigDocumentStore.getState().draft).toBe(draft);
  });

  it('adds a new manual group and its subscription in one draft write', () => {
    ConfigDocumentStore.getState().load('{}');
    expect(stageSubscription({ ...COMMON, group: SUBSCRIPTION_GROUP.New, groupName: 'manual' })).toBeNull();

    const draft = ConfigDocumentStore.getState().draft ?? '';
    expect(findValue(draft, ['providers'])).toEqual([
      { type: 'remote', tag: 'fresh', url: URL, update_interval: '5m' },
    ]);
    expect(findValue(draft, ['outbounds'])).toEqual([
      { type: 'selector', tag: 'manual', outbounds: [], providers: ['fresh'] },
    ]);
  });

  it('extends a scalar provider list without changing other group settings', () => {
    const outbounds = [
      { type: 'urltest', tag: 'latency', providers: 'existing', outbounds: ['direct'], tolerance: 50 },
      { type: 'selector', tag: 'all', use_all_providers: true },
    ];
    const applied = JSON.stringify({ outbounds });
    ConfigDocumentStore.getState().load(applied);

    const groups = subscriptionGroups(applied);
    expect(groups.automatic).toBe(true);
    expect(groups.explicit.map(({ label }) => label)).toEqual(['latency']);
    expect(stageSubscription({ ...COMMON, group: 'tag:latency' })).toBeNull();
    expect(findValue(ConfigDocumentStore.getState().draft ?? '', ['outbounds'])).toEqual([
      { ...outbounds[0], providers: ['existing', 'fresh'] },
      outbounds[1],
    ]);
  });
});

describe('subscription settings validation', () => {
  const schema = makeConnectionLinkSchema(true, new Set());

  it('validates the custom interval against the duration limit for its unit', () => {
    const values = { ...COMMON, interval: 'custom', intervalUnit: 'd' };
    expect(schema.safeParse({ ...values, intervalValue: String(MAX_INTERVAL.d) }).success).toBe(true);

    for (const intervalValue of ['0', '1.5', String(MAX_INTERVAL.d + 1)]) {
      expect(schema.safeParse({ ...values, intervalValue }).error?.issues).toEqual([
        { code: 'custom', path: ['intervalValue'], message: SUBSCRIPTION_ERROR.Interval },
      ]);
    }
  });

  it('rejects invalid HTTPS links and header control characters without echoing either value', () => {
    expect(schema.safeParse({ ...COMMON, link: 'https:///invalid' }).error?.issues).toEqual([
      { code: 'custom', path: ['link'], message: SUBSCRIPTION_ERROR.InvalidLink },
    ]);
    expect(schema.safeParse({ ...COMMON, agent: 'customAgent', agentValue: 'mock\nvalue' }).error?.issues).toEqual([
      { code: 'custom', path: ['agentValue'], message: SUBSCRIPTION_ERROR.Agent },
    ]);
  });
});
