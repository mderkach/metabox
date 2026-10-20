import type { ParseKeys, TFunction } from 'i18next';

/**
 * Only Clash API group types have a translation; node protocols (`vless`,
 * `shadowsocks`) under the same `type` field stay as they are.
 */
const GROUP_LABEL: Readonly<Record<string, ParseKeys<'shared'> | undefined>> = {
  Selector: 'groupType.selector',
  URLTest: 'groupType.urltest',
  Fallback: 'groupType.fallback',
  LoadBalance: 'groupType.loadBalance',
};

export function toGroupLabel(t: TFunction<'widgets/ProxyGroups'>, type: string): string {
  const key = GROUP_LABEL[type];

  return key === undefined ? type : t(key, { ns: 'shared' });
}

/** A group inside a group is named as a group, so it is not taken for a node. */
export function toMemberLabel(t: TFunction<'widgets/ProxyGroups'>, type: string): string {
  return GROUP_LABEL[type] === undefined ? type : t('node.group', { type: toGroupLabel(t, type) });
}
