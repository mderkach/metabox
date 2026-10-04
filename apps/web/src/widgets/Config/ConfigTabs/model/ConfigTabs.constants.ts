import type { ParseKeys } from 'i18next';

import { CONFIG_SECTION, type ConfigSection, type GenericSection } from '@entities/Config';

/** Цель ссылки вкладки в терминах роутера: секции без своего экрана идут параметром общего. */
type TabLink = { to: '/config' | '/config/rule-set' } | { to: '/config/$section'; params: { section: GenericSection } };

function sectionLink(section: GenericSection): TabLink {
  return { to: '/config/$section', params: { section } };
}

/**
 * Секции конфига в том же порядке, в каком они лежат в файле, — так вкладка
 * находится по памяти о `config.json`, а не по алфавиту.
 */
export const CONFIG_TABS = [
  { key: CONFIG_SECTION.Route, label: 'section.route', link: { to: '/config' } },
  { key: CONFIG_SECTION.RuleSet, label: 'section.ruleSet', link: { to: '/config/rule-set' } },
  { key: CONFIG_SECTION.Inbounds, label: 'section.inbounds', link: sectionLink(CONFIG_SECTION.Inbounds) },
  { key: CONFIG_SECTION.Outbounds, label: 'section.outbounds', link: sectionLink(CONFIG_SECTION.Outbounds) },
  { key: CONFIG_SECTION.Providers, label: 'section.providers', link: sectionLink(CONFIG_SECTION.Providers) },
  { key: CONFIG_SECTION.Endpoints, label: 'section.endpoints', link: sectionLink(CONFIG_SECTION.Endpoints) },
  { key: CONFIG_SECTION.Dns, label: 'section.dns', link: sectionLink(CONFIG_SECTION.Dns) },
  { key: CONFIG_SECTION.DnsRules, label: 'section.dnsRules', link: sectionLink(CONFIG_SECTION.DnsRules) },
  { key: CONFIG_SECTION.Services, label: 'section.services', link: sectionLink(CONFIG_SECTION.Services) },
  { key: CONFIG_SECTION.Ntp, label: 'section.ntp', link: sectionLink(CONFIG_SECTION.Ntp) },
  { key: CONFIG_SECTION.Certificate, label: 'section.certificate', link: sectionLink(CONFIG_SECTION.Certificate) },
  {
    key: CONFIG_SECTION.CertificateProviders,
    label: 'section.certificateProviders',
    link: sectionLink(CONFIG_SECTION.CertificateProviders),
  },
  { key: CONFIG_SECTION.HttpClients, label: 'section.httpClients', link: sectionLink(CONFIG_SECTION.HttpClients) },
  {
    key: CONFIG_SECTION.NetworkNamespaces,
    label: 'section.networkNamespaces',
    link: sectionLink(CONFIG_SECTION.NetworkNamespaces),
  },
  { key: CONFIG_SECTION.Log, label: 'section.log', link: sectionLink(CONFIG_SECTION.Log) },
  { key: CONFIG_SECTION.Experimental, label: 'section.experimental', link: sectionLink(CONFIG_SECTION.Experimental) },
] as const satisfies ReadonlyArray<{
  key: ConfigSection;
  label: ParseKeys<'widgets/Config/ConfigTabs'>;
  link: TabLink;
}>;

/** Адрес вкладки для сверки с текущим: у общего экрана он собран из параметра. */
export function tabPath(tab: (typeof CONFIG_TABS)[number]): string {
  return 'params' in tab.link ? `/config/${tab.link.params.section}` : tab.link.to;
}

export const CONFIG_MODE_ROUTE = {
  Forms: '/config',
  Text: '/config/raw',
} as const;

export type ConfigModeRoute = (typeof CONFIG_MODE_ROUTE)[keyof typeof CONFIG_MODE_ROUTE];

/**
 * Вторая ось полосы: чем документ показан. Секции отвечают на «какую часть
 * смотрю», режим — на «формами или текстом». Текст показывает файл целиком,
 * поэтому в нём ни одна секция не выбрана, а возврат к формам ведёт на первую.
 */
export const CONFIG_MODES = [
  { key: 'forms', label: 'mode.forms', route: CONFIG_MODE_ROUTE.Forms },
  { key: 'text', label: 'mode.text', route: CONFIG_MODE_ROUTE.Text },
] as const satisfies ReadonlyArray<{
  key: string;
  label: ParseKeys<'widgets/Config/ConfigTabs'>;
  route: ConfigModeRoute;
}>;
