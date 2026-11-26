import type { ParseKeys, TFunction } from 'i18next';

import { SHARED_NS } from '@shared/i18n';

import type { PROXY_GROUPS_NS } from '../i18n/ProxyGroups.namespace.generated';

/**
 * Only Clash API group types have a translation; node protocols (`vless`,
 * `shadowsocks`) under the same `type` field stay as they are.
 */
const GROUP_LABEL: Readonly<Record<string, ParseKeys<typeof SHARED_NS> | undefined>> = {
  Selector: 'groupType.selector',
  URLTest: 'groupType.urltest',
  Fallback: 'groupType.fallback',
  LoadBalance: 'groupType.loadBalance',
};

export function toGroupLabel(t: TFunction<typeof PROXY_GROUPS_NS>, type: string): string {
  const key = GROUP_LABEL[type];

  return key === undefined ? type : t(key, { ns: SHARED_NS });
}

/** A group inside a group is named as a group, so it is not taken for a node. */
export function toMemberLabel(t: TFunction<typeof PROXY_GROUPS_NS>, type: string): string {
  return GROUP_LABEL[type] === undefined ? type : t('node.group', { type: toGroupLabel(t, type) });
}
