import type { RuleSetProvider } from './RuleSet.model';

/**
 * Каталог поставщиков готовых наборов и словарь набора.
 *
 * В каталоге лежат только те источники, чей шаблон адреса проверен: неверный
 * адрес нельзя отличить от недоступного поставщика, а цена ошибки — несостоя-
 * вшийся старт sing-box. Источник, которого здесь нет, подключается своим
 * адресом — этот путь остаётся всегда.
 *
 * Полный перечень категорий — снимок `RuleSet.categories.generated.json`,
 * его обновляет `pnpm --filter web gen:rule-sets`. Снимок стареет, поэтому имя,
 * которого в нём нет, по-прежнему вводится руками и собирается в адрес тем же
 * шаблоном.
 */

export const RULE_SET_TYPE = {
  Remote: 'remote',
  Local: 'local',
  Inline: 'inline',
} as const;

export const RULE_SET_FORMAT = {
  Binary: 'binary',
  Source: 'source',
} as const;

/** Расширения, по которым ядро само выводит формат набора. */
export const SET_EXTENSION = {
  Binary: '.srs',
  Source: '.json',
} as const;

const RUNET_FREEDOM_BASE = 'runetfreedom/russia-v2ray-rules-dat';

const RUNET_GEOSITE: RuleSetProvider = {
  id: 'runetfreedom-geosite',
  name: 'Runet Freedom geosite',
  kind: 'domain',
  prefix: 'geosite-',
  mirrors: [
    {
      id: 'github',
      name: 'GitHub',
      base: `https://raw.githubusercontent.com/${RUNET_FREEDOM_BASE}/release/sing-box/rule-set-geosite/`,
    },
    {
      id: 'jsdelivr',
      name: 'jsDelivr',
      base: `https://cdn.jsdelivr.net/gh/${RUNET_FREEDOM_BASE}@release/sing-box/rule-set-geosite/`,
    },
  ],
  featured: [
    'ru-blocked',
    'ru-blocked-all',
    'ru-available-only-inside',
    'category-ads-all',
    'youtube',
    'google',
    'telegram',
    'discord',
    'openai',
    'meta',
    'instagram',
    'facebook',
    'twitter',
    'tiktok',
    'whatsapp',
    'netflix',
    'spotify',
    'github',
    'cloudflare',
    'microsoft',
    'apple',
    'category-gov-ru',
    'win-spy',
    'category-porn',
    'private',
  ],
};

const RUNET_GEOIP: RuleSetProvider = {
  id: 'runetfreedom-geoip',
  name: 'Runet Freedom geoip',
  kind: 'ip',
  prefix: 'geoip-',
  mirrors: [
    {
      id: 'github',
      name: 'GitHub',
      base: `https://raw.githubusercontent.com/${RUNET_FREEDOM_BASE}/release/sing-box/rule-set-geoip/`,
    },
    {
      id: 'jsdelivr',
      name: 'jsDelivr',
      base: `https://cdn.jsdelivr.net/gh/${RUNET_FREEDOM_BASE}@release/sing-box/rule-set-geoip/`,
    },
  ],
  featured: [
    'ru-blocked',
    'ru-blocked-community',
    're-filter',
    'ru-whitelist',
    'ru',
    'private',
    'telegram',
    'cloudflare',
    'google',
    'ddos-guard',
    'yandex',
  ],
};

const SING_GEOSITE: RuleSetProvider = {
  id: 'sing-geosite',
  name: 'v2fly geosite',
  kind: 'domain',
  prefix: 'geosite-',
  mirrors: [
    { id: 'github', name: 'GitHub', base: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/' },
    { id: 'jsdelivr', name: 'jsDelivr', base: 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/' },
  ],
  featured: [
    'google',
    'google-play',
    'youtube',
    'telegram',
    'netflix',
    'github',
    'cloudflare',
    'apple',
    'microsoft',
    'openai',
    'spotify',
    'twitter',
    'facebook',
    'instagram',
    'amazon',
    'steam',
    'discord',
    'reddit',
    'tiktok',
    'wikimedia',
    'category-ads-all',
    'category-ads',
    'category-porn',
    'category-games',
    'category-media',
    'category-social-media-cn',
    'category-social-media-!cn',
    'category-vpnservices',
    'geolocation-cn',
    'geolocation-!cn',
    'cn',
    'private',
  ],
};

const SING_GEOIP: RuleSetProvider = {
  id: 'sing-geoip',
  name: 'v2fly geoip',
  kind: 'ip',
  prefix: 'geoip-',
  mirrors: [
    { id: 'github', name: 'GitHub', base: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/' },
    { id: 'jsdelivr', name: 'jsDelivr', base: 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/' },
  ],
  featured: ['ru', 'cn', 'us', 'de', 'nl', 'gb', 'fr', 'jp', 'sg', 'tr', 'ir', 'by', 'kz', 'ua'],
};

export const RULE_SET_PROVIDERS: readonly RuleSetProvider[] = [RUNET_GEOSITE, RUNET_GEOIP, SING_GEOSITE, SING_GEOIP];
