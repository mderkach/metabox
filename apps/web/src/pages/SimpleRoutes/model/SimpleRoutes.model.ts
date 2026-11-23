import {
  CONFIG_SECTION,
  hasRuleSetCache,
  readNodeTags,
  readRuleNames,
  readRules,
  readSectionNodes,
  readSubscriptionTagReservations,
  toFinalOutbound,
  type ConfigDocument,
} from '@entities/Config';
import { toRuleRowsFromNodes } from '@entities/Rule';
import { RULE_SET_TYPE } from '@entities/RuleSet';

export function toSimpleRoutes(config: ConfigDocument, text: string, appliedText: string | null) {
  const rules = toRuleRowsFromNodes(readRules(text), readRuleNames(text));
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
