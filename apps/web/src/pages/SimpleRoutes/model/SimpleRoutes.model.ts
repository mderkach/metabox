import {
  CONFIG_SECTION,
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
import { hasDuplicateJsoncKeys } from '@shared/lib/jsonc';

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
  const providers = config.providers?.length ?? 0;
  const appliedTags = new Set(
    appliedText === null
      ? []
      : readSectionNodes(appliedText, CONFIG_SECTION.Outbounds).map((node): unknown =>
          typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined
        )
  );

  return {
    rules,
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
    providers,
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
