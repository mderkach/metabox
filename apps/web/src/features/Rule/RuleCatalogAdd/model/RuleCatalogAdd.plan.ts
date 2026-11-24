import {
  CONFIG_SECTION,
  dnsPathOverride,
  eligibleDnsExit,
  eligibleResolvers,
  hasDomainDnsIngress,
  hasVerifiedDnsCore,
  onlyKeys,
  strings,
  insertValue,
  parseConfig,
  readSubscriptionTagReservations,
  RULES_PATH,
  ruleSetNodePath,
  sectionNodePath,
} from '@entities/Config';
import {
  buildRuleSetURL,
  collectRuleSetUsage,
  isCatalogCategory,
  RULE_SET_LIST_KIND,
  suggestTag,
  type RuleSetList,
} from '@entities/RuleSet';
import { isRecord } from '@shared/lib/isRecord';
import { hasDuplicateJsoncKeys } from '@shared/lib/jsonc';

export function getCatalogResolvers(text: string, outbound: string): string[] {
  const { config } = parseConfig(text);
  return config === null ? [] : eligibleResolvers(config, outbound);
}

export interface CatalogSelection {
  text: string;
  coreVersion: string | undefined;
  list: RuleSetList;
  category: string;
  outbound: string;
  resolver: string;
}

interface RulePosition {
  position: number;
  reused: boolean;
}

type BlockReason =
  | 'core'
  | 'draft'
  | 'service'
  | 'exit'
  | 'resolver'
  | 'ingress'
  | 'setConflict'
  | 'routeConflict'
  | 'dnsConflict';

function blocked(reason: BlockReason, detail = '') {
  return { ok: false, reason, detail } as const;
}

/** The core stores these profiles in the remote set bucket under their effective node tag. */
function hasProfileTag(
  nodes: readonly { type: string; tag?: string }[],
  type: 'warp' | 'masque',
  tag: string
): boolean {
  return nodes.some(
    (node, index) =>
      node.type === type && (node.tag === undefined || node.tag === '' ? String(index) : node.tag) === tag
  );
}

function positionFor(
  rules: readonly unknown[],
  kind: 'route' | 'dns',
  setTag: string,
  target: string
): RulePosition | ReturnType<typeof blocked> {
  const field = kind === 'route' ? 'outbound' : 'server';
  for (let index = kind === 'route' ? 1 : 0; index < rules.length; index++) {
    const rule = rules[index];
    const position = index + 1;
    if (
      isRecord(rule) &&
      onlyKeys(rule, 'type', 'action', 'rule_set', field) &&
      (rule.type === undefined || rule.type === 'default') &&
      (rule.action === undefined || rule.action === 'route') &&
      rule[field] === target &&
      strings(rule.rule_set).length > 0
    ) {
      if (strings(rule.rule_set).includes(setTag)) return { position, reused: true };
      // Opaque sets may overlap, but this terminal rule already has the requested outcome.
      continue;
    }
    return blocked(kind === 'route' ? 'routeConflict' : 'dnsConflict', String(position));
  }
  return { position: rules.length + 1, reused: false };
}

export function planCatalogService({ text, coreVersion, list, category, outbound, resolver }: CatalogSelection) {
  if (!hasVerifiedDnsCore(coreVersion)) return blocked('core', coreVersion);
  if (list.kind !== RULE_SET_LIST_KIND.Geosite || !isCatalogCategory(list, category) || !list.mirrors.length) {
    return blocked('service', category);
  }
  const parsed = parseConfig(text);
  const { config } = parsed;
  if (!config || hasDuplicateJsoncKeys(text) || parsed.unknown.some(({ path }) => path === 'route' || path === 'dns')) {
    return blocked('draft');
  }
  const override = dnsPathOverride(config);
  if (override !== undefined) return blocked('draft', override);
  if (!eligibleDnsExit(config, outbound)) return blocked('exit', outbound);

  const urls = list.mirrors.map(({ id }) => buildRuleSetURL(list, id, category));
  const sets = config.route?.rule_set ?? [];
  const matching = sets.filter((node) => node.type === 'remote' && urls.includes(node.url ?? ''));
  const existing = matching.at(0);
  const setTag = typeof existing?.tag === 'string' ? existing.tag : suggestTag(list, category);
  const addSet = existing === undefined;
  const reserved = readSubscriptionTagReservations(text, CONFIG_SECTION.RuleSet);
  if (
    matching.length > 1 ||
    !setTag ||
    reserved.includes(setTag) ||
    hasProfileTag(config.endpoints ?? [], 'warp', setTag) ||
    hasProfileTag(config.outbounds ?? [], 'masque', setTag) ||
    sets.some((node) => node !== existing && strings(node.tag).includes(setTag)) ||
    (existing !== undefined &&
      (existing.type !== 'remote' ||
        typeof existing.tag !== 'string' ||
        existing.tag === '' ||
        (existing.format !== undefined && existing.format !== '' && existing.format !== 'binary') ||
        !onlyKeys(existing, 'type', 'tag', 'url', 'format', 'update_interval', 'download_detour', 'http_client')))
  ) {
    return blocked('setConflict', setTag);
  }
  const routes = config.route?.rules ?? [];
  const dnsRules = config.dns?.rules ?? [];
  if (
    addSet &&
    collectRuleSetUsage([
      { kind: 'route', rules: routes, names: [] },
      { kind: 'dns', rules: dnsRules, names: [] },
    ]).has(setTag)
  )
    return blocked('setConflict', setTag);
  if (!hasDomainDnsIngress(config)) return blocked('ingress');

  const route = positionFor(routes, 'route', setTag, outbound);
  if ('ok' in route) return route;

  const eligible = eligibleResolvers(config, outbound);
  const assigned: unknown = dnsRules.find((node) => 'rule_set' in node && strings(node.rule_set).includes(setTag));
  const server = resolver || (isRecord(assigned) && typeof assigned.server === 'string' ? assigned.server : '');
  if (!eligible.includes(server)) return blocked('resolver', outbound);
  const dns = positionFor(dnsRules, 'dns', setTag, server);
  if ('ok' in dns) return dns;

  let candidate: string | null = text;
  if (addSet)
    candidate = insertValue(candidate, ruleSetNodePath(sets.length), {
      type: 'remote',
      tag: setTag,
      format: 'binary',
      url: urls[0],
    });
  if (candidate !== null && !route.reused) {
    candidate = insertValue(candidate, [...RULES_PATH, route.position - 1], {
      rule_set: [setTag],
      action: 'route',
      outbound,
    });
  }
  if (candidate !== null && !dns.reused) {
    candidate = insertValue(candidate, sectionNodePath(CONFIG_SECTION.DnsRules, dns.position - 1), {
      rule_set: [setTag],
      action: 'route',
      server,
    });
  }
  if (candidate === null || parseConfig(candidate).config === null) return blocked('draft');
  return { ok: true, text: candidate, setTag, addSet, route, dns, resolver: server } as const;
}
