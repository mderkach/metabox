import type { ParseKeys, TFunction } from 'i18next';

/**
 * Только типы групп Clash API имеют перевод; протоколы узлов (`vless`,
 * `shadowsocks`) под тем же полем `type` остаются как есть.
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
