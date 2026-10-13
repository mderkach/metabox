import type { ParseKeys, TFunction } from 'i18next';

/**
 * Only Clash API group types have a translation; node protocols (`vless`,
 * `shadowsocks`) under the same `type` field stay as they are.
 */
const GROUP_LABEL: Readonly<Record<string, ParseKeys<'widgets/ProxyGroups'> | undefined>> = {
  Selector: 'type.selector',
  URLTest: 'type.urlTest',
  Fallback: 'type.fallback',
  LoadBalance: 'type.loadBalance',
};

export function toGroupLabel(t: TFunction<'widgets/ProxyGroups'>, type: string): string {
  const key = GROUP_LABEL[type];

  return key === undefined ? type : t(key);
}
