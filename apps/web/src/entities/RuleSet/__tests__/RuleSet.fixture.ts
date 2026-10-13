import type { RuleSetCatalogWire, RuleSetListWire } from '../api/RuleSet.schema';

/** 2026-09-25 00:00 UTC: a check after which the catalog did not change. */
const CHECKED_AT = 1_790_294_400;

/** 2026-09-01 00:00 UTC: the build that the snapshot came from. */
const SNAPSHOT_AT = 1_788_220_800;

function mirrors(raw: string, cdn: string): RuleSetListWire['mirrors'] {
  return [
    { id: 'github', name: 'GitHub', base: raw },
    { id: 'jsdelivr', name: 'jsDelivr', base: cdn },
  ];
}

const RUNET_RAW = 'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/';
const RUNET_CDN = 'https://cdn.jsdelivr.net/gh/runetfreedom/russia-v2ray-rules-dat@release/sing-box/';

/**
 * A miniature daemon catalog: both providers, each with sites and addresses. For
 * Runet Freedom the catalog is checked, for v2fly it is still the build snapshot, so the test bench
 * shows both labels.
 */
export const RULE_SET_CATALOG_FIXTURE: RuleSetCatalogWire = {
  providers: [
    {
      id: 'runetfreedom',
      name: 'Runet Freedom',
      lists: [
        {
          kind: 'geosite',
          prefix: 'geosite-',
          mirrors: mirrors(`${RUNET_RAW}rule-set-geosite/`, `${RUNET_CDN}rule-set-geosite/`),
          featured: ['ru-blocked', 'ru-blocked-all', 'youtube', 'telegram'],
          categories: [
            'category-ads-all',
            'category-media-ru-blocked',
            'discord',
            'google',
            'ru-available-only-inside',
            'ru-blocked',
            'ru-blocked-all',
            'telegram',
            'yandex',
            'yandex@ads',
            'youtube',
          ],
          source: 'provider',
          updated_at: CHECKED_AT,
        },
        {
          kind: 'geoip',
          prefix: 'geoip-',
          mirrors: mirrors(`${RUNET_RAW}rule-set-geoip/`, `${RUNET_CDN}rule-set-geoip/`),
          featured: ['ru-blocked', 're-filter'],
          categories: ['private', 're-filter', 'ru', 'ru-blocked', 'ru-blocked-community', 'telegram'],
          source: 'provider',
          updated_at: CHECKED_AT,
        },
      ],
    },
    {
      id: 'v2fly',
      name: 'v2fly',
      lists: [
        {
          kind: 'geosite',
          prefix: 'geosite-',
          mirrors: mirrors(
            'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/',
            'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/'
          ),
          featured: ['google', 'youtube'],
          categories: ['category-google-cn', 'github', 'google', 'google-play', 'youtube'],
          source: 'snapshot',
          updated_at: SNAPSHOT_AT,
        },
        {
          kind: 'geoip',
          prefix: 'geoip-',
          mirrors: mirrors(
            'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/',
            'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/'
          ),
          featured: ['ru', 'cn'],
          categories: ['cn', 'de', 'ru', 'us'],
          source: 'snapshot',
          updated_at: SNAPSHOT_AT,
        },
      ],
    },
  ],
};
