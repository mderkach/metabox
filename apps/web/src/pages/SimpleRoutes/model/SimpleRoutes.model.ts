import {
  CONFIG_SECTION,
  hasDomainDnsIngress,
  hasRuleSetCache,
  readNodeTags,
  readRuleNames,
  readRules,
  readRuleSets,
  readSectionNodes,
  readSubscriptionTagReservations,
  toFinalOutbound,
  type ConfigDocument,
} from '@entities/Config';
import { toRuleRowsFromNodes } from '@entities/Rule';
import { collectRuleSetUsage, RULE_SET_TYPE } from '@entities/RuleSet';
import { isRecord } from '@shared/lib/isRecord';
import { hasDuplicateJsoncKeys } from '@shared/lib/jsonc';

export const SIMPLE_SERVICE_SUGGESTIONS_ID = 'service-suggestions';

function readTags(text: string | null, section: typeof CONFIG_SECTION.Outbounds | typeof CONFIG_SECTION.Providers) {
  return new Set(
    text === null
      ? []
      : readSectionNodes(text, section).flatMap((node) =>
          isRecord(node) && typeof node.tag === 'string' && node.tag !== '' ? [node.tag] : []
        )
  );
}

export function toSimpleRoutes(config: ConfigDocument, text: string, appliedText: string | null) {
  const ruleNodes = readRules(text);
  const names = readRuleNames(text);
  const rules = toRuleRowsFromNodes(ruleNodes, names);
  const occurrences = new Map<string, number>();
  const ruleKeys = ruleNodes.map((node, index) => {
    const identity = JSON.stringify([node, names[index]]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return `${String(occurrence)}:${identity}`;
  });
  const usage = collectRuleSetUsage([
    { kind: 'route', rules: ruleNodes, names },
    { kind: 'dns', rules: readSectionNodes(text, CONFIG_SECTION.DnsRules), names: readRuleNames(text, 'dns') },
  ]);
  const inbounds = config.inbounds?.length ?? 0;
  const dnsServers = config.dns?.servers?.length ?? 0;
  const dnsRules = config.dns?.rules?.length ?? 0;
  const dnsFinal = config.dns?.final;
  const outbounds = config.outbounds ?? [];
  const outboundTagCounts = new Map<string, number>();
  for (const { tag } of outbounds) {
    if (tag !== undefined && tag !== '') outboundTagCounts.set(tag, (outboundTagCounts.get(tag) ?? 0) + 1);
  }
  const outboundOccurrences = new Map<string, number>();
  const outboundEntries = outbounds.map((node) => {
    if (node.tag !== undefined && outboundTagCounts.get(node.tag) === 1) return { node, key: `tag:${node.tag}` };

    const identity = JSON.stringify(node);
    const occurrence = outboundOccurrences.get(identity) ?? 0;
    outboundOccurrences.set(identity, occurrence + 1);
    return { node, key: `node:${String(occurrence)}:${identity}` };
  });
  const providers = config.providers?.length ?? 0;
  const appliedTags = readTags(appliedText, CONFIG_SECTION.Outbounds);
  const providerTags = [...readTags(text, CONFIG_SECTION.Providers)];
  const appliedProviderTags = readTags(appliedText, CONFIG_SECTION.Providers);

  return {
    rules,
    suggestServices: ruleNodes.length === 0 || (ruleNodes.length === 1 && hasDomainDnsIngress(config)),
    ruleKeys,
    ruleNodes,
    usage,
    setNodes: readRuleSets(text),
    duplicateKeys: hasDuplicateJsoncKeys(text),
    inbounds,
    dnsServers,
    needsCache:
      config.route?.rule_set?.some((set) => set.type === RULE_SET_TYPE.Remote) === true && !hasRuleSetCache(text),
    dnsRules,
    dnsFinal,
    outbounds,
    outboundEntries,
    providers,
    appliedProviderTags: new Set(providerTags.filter((tag) => appliedProviderTags.has(tag))),
    hasStagedSubscriptions: providerTags.some((tag) => !appliedProviderTags.has(tag)),
    takenTags: [...readNodeTags(text), ...readSubscriptionTagReservations(text, CONFIG_SECTION.Outbounds)],
    stagedTags: new Set(
      appliedText === null
        ? []
        : outbounds.flatMap(({ tag }) => (typeof tag === 'string' && tag !== '' && !appliedTags.has(tag) ? [tag] : []))
    ),
    empty:
      inbounds === 0 &&
      dnsServers === 0 &&
      dnsRules === 0 &&
      (dnsFinal ?? '') === '' &&
      outbounds.length === 0 &&
      providers === 0 &&
      (config.endpoints?.length ?? 0) === 0 &&
      rules.length === 0 &&
      (config.route?.rule_set?.length ?? 0) === 0 &&
      toFinalOutbound(config) === null,
  };
}
