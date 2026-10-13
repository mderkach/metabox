import type { ParseKeys } from 'i18next';

import { CONFIG_SECTION, type ConfigSection, type GenericSection } from '@entities/Config';

/** Tab link target in router terms: sections without a screen of their own go as a parameter of a shared one. */
type TabLink = { to: '/config' | '/config/rule-set' } | { to: '/config/$section'; params: { section: GenericSection } };

function sectionLink(section: GenericSection): TabLink {
  return { to: '/config/$section', params: { section } };
}

/**
 * Config sections in the same order as they lie in the file — so a tab
 * is found by memory of `config.json`, not alphabetically.
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

/**
 * Sections edited more often than the rest: routing, what it
 * references, and DNS. They are always in the strip, the rest are in the "More" menu:
 * sixteen tabs do not fit in a row even on a desktop, and a tail past the edge of
 * the strip is not discoverable. Six is how many fit in a row without scrolling at
 * width 1280. A selected rare section takes its place in the strip by
 * file order while it is selected.
 */
export const CONFIG_TABS_FREQUENT: ReadonlySet<ConfigSection> = new Set([
  CONFIG_SECTION.Route,
  CONFIG_SECTION.RuleSet,
  CONFIG_SECTION.Inbounds,
  CONFIG_SECTION.Outbounds,
  CONFIG_SECTION.Providers,
  CONFIG_SECTION.Dns,
]);

/** Tab address for comparison with the current one: for the shared screen it is built from the parameter. */
export function tabPath(tab: (typeof CONFIG_TABS)[number]): string {
  return 'params' in tab.link ? `/config/${tab.link.params.section}` : tab.link.to;
}

export const CONFIG_MODE_ROUTE = {
  Forms: '/config',
  Text: '/config/raw',
} as const;

export type ConfigModeRoute = (typeof CONFIG_MODE_ROUTE)[keyof typeof CONFIG_MODE_ROUTE];

/**
 * The second axis of the strip: how the document is shown. Sections answer "which part
 * am I looking at", the mode answers "forms or text". Text shows the whole file,
 * so no section is selected in it, and returning to forms leads to the first one.
 */
export const CONFIG_MODES = [
  { key: 'forms', label: 'mode.forms', route: CONFIG_MODE_ROUTE.Forms },
  { key: 'text', label: 'mode.text', route: CONFIG_MODE_ROUTE.Text },
] as const satisfies ReadonlyArray<{
  key: string;
  label: ParseKeys<'widgets/Config/ConfigTabs'>;
  route: ConfigModeRoute;
}>;
