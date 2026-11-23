import {
  CONFIG_SECTION,
  ConfigDocumentStore,
  insertValue,
  readNodeTags,
  readSectionNodes,
  readSubscriptionTagReservations,
  sectionNodePath,
  selectConfigCurrent,
  selectConfigStale,
  setValue,
} from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';

import type { ConnectionLinkModel } from './ConfigNodeAdd.schema';

export const SUBSCRIPTION_GROUP = { None: 'none', New: 'new' } as const;
export const SUBSCRIPTION_INTERVALS = ['5m', '15m', '1h', '24h', 'custom'] as const;
export const SUBSCRIPTION_INTERVAL_UNITS = ['m', 'h', 'd'] as const;
export const SUBSCRIPTION_AGENT_PROFILES = ['defaultAgent', 'chrome', 'firefox', 'safari', 'customAgent'] as const;

export const SUBSCRIPTION_AGENTS = new Map([
  [
    'chrome',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ],
  ['firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'],
  [
    'safari',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  ],
]);

export const SUBSCRIPTION_ERROR = {
  InvalidLink: 'invalidLink',
  TagRequired: 'subscriptionTagRequired',
  TagTaken: 'subscriptionTagTaken',
  GroupTaken: 'subscriptionGroupTaken',
  GroupUnavailable: 'subscriptionGroupUnavailable',
  Interval: 'subscriptionInterval',
  Agent: 'subscriptionAgent',
  Stale: 'subscriptionStale',
  Write: 'subscriptionWrite',
} as const;

export const MAX_INTERVAL = { m: 153_722_867, h: 2_562_047, d: 106_751 } as const;

export function subscriptionUrl(input: string): string | null {
  const url = input.trim();

  return /^https:\/\/[^/\\\s]/i.test(url) && !/[\s\\]/.test(url) && URL.canParse(url) ? url : null;
}

export function subscriptionTags(text: string, applied: string | null): Set<string> {
  return new Set(
    [text, applied ?? text].flatMap((source) => readSubscriptionTagReservations(source, CONFIG_SECTION.Providers))
  );
}

export function subscriptionGroups(text: string) {
  const groups = readSectionNodes(text, CONFIG_SECTION.Outbounds).flatMap((node, index) => {
    if (!isRecord(node) || (node.type !== 'selector' && node.type !== 'urltest')) return [];

    const path = sectionNodePath(CONFIG_SECTION.Outbounds, index);

    return typeof node.tag === 'string' && node.tag !== '' ? [{ node, tag: node.tag, path }] : [];
  });

  return {
    automatic: groups.some(({ node }) => node.use_all_providers === true),
    explicit: groups.flatMap(({ node, tag, path }) => {
      if (node.use_all_providers === true) return [];

      const providers = typeof node.providers === 'string' ? [node.providers] : (node.providers ?? []);
      if (!Array.isArray(providers) || !providers.every((value) => typeof value === 'string')) return [];

      return [{ value: `tag:${tag}`, label: tag, path, providers }];
    }),
  };
}

type SubscriptionFailure = {
  field: 'link' | 'tag' | 'group' | 'groupName' | 'root';
  message: (typeof SUBSCRIPTION_ERROR)[keyof typeof SUBSCRIPTION_ERROR];
};

export function stageSubscription(data: ConnectionLinkModel): SubscriptionFailure | null {
  const state = ConfigDocumentStore.getState();
  const text = selectConfigCurrent(state);
  const url = subscriptionUrl(data.link);
  const tag = data.tag.trim();

  if (url === null) return { field: 'link', message: SUBSCRIPTION_ERROR.InvalidLink };
  if (text === null || state.applied === null || selectConfigStale(state)) {
    return { field: 'root', message: SUBSCRIPTION_ERROR.Stale };
  }
  if (subscriptionTags(text, state.applied).has(tag)) {
    return { field: 'tag', message: SUBSCRIPTION_ERROR.TagTaken };
  }

  const index = readSectionNodes(text, CONFIG_SECTION.Providers).length;
  const updateInterval =
    data.interval === 'custom' ? `${Number(data.intervalValue)}${data.intervalUnit}` : data.interval;
  let next = insertValue(text, sectionNodePath(CONFIG_SECTION.Providers, index), {
    type: 'remote',
    tag,
    url,
    update_interval: updateInterval,
    ...(data.agent === 'defaultAgent' ? {} : { user_agent: data.agentValue.trim() }),
  });
  if (next === null) return { field: 'root', message: SUBSCRIPTION_ERROR.Write };

  if (data.group === SUBSCRIPTION_GROUP.New) {
    const groupTag = data.groupName.trim();
    if ([...readNodeTags(text), ...readNodeTags(state.applied), tag].includes(groupTag)) {
      return { field: 'groupName', message: SUBSCRIPTION_ERROR.GroupTaken };
    }

    const groupIndex = readSectionNodes(text, CONFIG_SECTION.Outbounds).length;
    next = insertValue(next, sectionNodePath(CONFIG_SECTION.Outbounds, groupIndex), {
      type: 'selector',
      tag: groupTag,
      outbounds: [],
      providers: [tag],
    });
    if (next === null) return { field: 'root', message: SUBSCRIPTION_ERROR.Write };
  } else if (data.group !== SUBSCRIPTION_GROUP.None) {
    const group = subscriptionGroups(text).explicit.find(({ value }) => value === data.group);
    if (group === undefined) return { field: 'group', message: SUBSCRIPTION_ERROR.GroupUnavailable };
    if (!group.providers.includes(tag)) next = setValue(next, [...group.path, 'providers'], [...group.providers, tag]);
  }

  state.replace(next);

  return null;
}
