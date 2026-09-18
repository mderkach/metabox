import type { RuleSetProvider } from './RuleSet.model';

/**
 * Каталог поставщиков готовых наборов и словарь набора.
 *
 * В каталоге лежат только те источники, чей шаблон адреса проверен: неверный
 * адрес нельзя отличить от недоступного поставщика, а цена ошибки — несостоя-
 * вшийся старт sing-box. Источник, которого здесь нет, подключается своим
 * адресом — этот путь остаётся всегда.
 *
 * Перечень категорий — не полный каталог поставщика, а часто спрашиваемое:
 * полным его делает демон, когда начнёт обновлять индекс. Поэтому имя, которого
 * в списке нет, вводится руками и собирается в адрес тем же шаблоном.
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

const SING_GEOSITE: RuleSetProvider = {
  id: 'sing-geosite',
  name: 'v2fly geosite',
  kind: 'domain',
  prefix: 'geosite-',
  mirrors: [
    { id: 'github', name: 'GitHub', base: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/' },
    { id: 'jsdelivr', name: 'jsDelivr', base: 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/' },
  ],
  categories: [
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
    'ru',
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
  categories: ['ru', 'cn', 'us', 'de', 'nl', 'gb', 'fr', 'jp', 'sg', 'tr', 'ir', 'by', 'kz', 'ua'],
};

export const RULE_SET_PROVIDERS: readonly RuleSetProvider[] = [SING_GEOSITE, SING_GEOIP];
