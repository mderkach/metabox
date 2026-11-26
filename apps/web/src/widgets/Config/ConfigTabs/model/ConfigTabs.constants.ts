import type { ParseKeys } from 'i18next';

import { CONFIG_SECTION, type ConfigSection } from '@entities/Config';
import type { PageLink, StaticPagePath } from '@shared/lib/navigation';

import type { CONFIG_TABS_NS } from '../i18n/ConfigTabs.namespace.generated';

/**
 * Config sections in the same order as they lie in the file — so a tab
 * is found by memory of `config.json`, not alphabetically.
 */
export const CONFIG_TABS = [
  { key: CONFIG_SECTION.Route, label: 'section.route' },
  { key: CONFIG_SECTION.RuleSet, label: 'section.ruleSet' },
  { key: CONFIG_SECTION.Inbounds, label: 'section.inbounds' },
  { key: CONFIG_SECTION.Outbounds, label: 'section.outbounds' },
  { key: CONFIG_SECTION.Providers, label: 'section.providers' },
  { key: CONFIG_SECTION.Endpoints, label: 'section.endpoints' },
  { key: CONFIG_SECTION.Dns, label: 'section.dns' },
  { key: CONFIG_SECTION.DnsRules, label: 'section.dnsRules' },
  { key: CONFIG_SECTION.Services, label: 'section.services' },
  { key: CONFIG_SECTION.Ntp, label: 'section.ntp' },
  { key: CONFIG_SECTION.Certificate, label: 'section.certificate' },
  {
    key: CONFIG_SECTION.CertificateProviders,
    label: 'section.certificateProviders',
  },
  { key: CONFIG_SECTION.HttpClients, label: 'section.httpClients' },
  {
    key: CONFIG_SECTION.NetworkNamespaces,
    label: 'section.networkNamespaces',
  },
  { key: CONFIG_SECTION.Log, label: 'section.log' },
  { key: CONFIG_SECTION.Experimental, label: 'section.experimental' },
] as const satisfies ReadonlyArray<{
  key: ConfigSection;
  label: ParseKeys<typeof CONFIG_TABS_NS>;
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

export interface ConfigViewLinks {
  simple: StaticPagePath;
  raw: StaticPagePath;
  section: (section: ConfigSection) => PageLink;
}
