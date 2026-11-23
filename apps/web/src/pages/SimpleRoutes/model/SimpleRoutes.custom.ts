import { z } from 'zod';

import {
  insertValue,
  isNodeRecognized,
  NODE_REGISTRY,
  parseConfig,
  RULES_PATH,
  type ConfigDocument,
} from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';
import { hasDuplicateJsoncKeys } from '@shared/lib/jsonc';

import {
  isDeviceAddress,
  simpleAddress,
  simpleRuleRelation,
  simpleTerminalConditions,
} from './SimpleRoutes.conditions';

export const CustomRuleSchema = z.object({
  address: z.string(),
  device: z.string(),
  outbound: z.string().min(1),
});
export type CustomRuleForm = z.infer<typeof CustomRuleSchema>;

export function customExits(config: ConfigDocument | null) {
  const exits = config?.outbounds ?? [];
  function effectiveTag(exit: { tag?: string }, index: number) {
    return exit.tag === undefined || exit.tag === '' ? String(index) : exit.tag;
  }
  const tags = [...exits.map(effectiveTag), ...(config?.endpoints ?? []).map(effectiveTag)];
  return exits.flatMap((exit) =>
    exit.tag !== undefined &&
    exit.tag !== '' &&
    tags.indexOf(exit.tag) === tags.lastIndexOf(exit.tag) &&
    isNodeRecognized(NODE_REGISTRY.Outbound, exit)
      ? [exit.tag]
      : []
  );
}

export function canAddDeviceException(node: unknown) {
  const match = simpleTerminalConditions(node);
  return !!match?.key && !match.sources;
}

function blocked(
  reason: 'invalid' | 'deviceRequired' | 'exit' | 'draft' | 'unknown' | 'duplicate' | 'parent',
  position = 0
) {
  return { ok: false, reason, position } as const;
}

/** These rules stay ahead of routing decisions; a matching DNS request continues to be handled there. */
function isServiceStep(node: unknown) {
  if (!isRecord(node)) return false;
  if (node.action === 'sniff')
    return Object.keys(node).every((key) => key === 'action' || key === 'sniffer' || key === 'timeout');
  return (
    node.action === 'hijack-dns' &&
    Object.keys(node).every((key) => key === 'action' || key === 'protocol') &&
    (node.protocol === 'dns' ||
      (Array.isArray(node.protocol) && node.protocol.length === 1 && node.protocol[0] === 'dns'))
  );
}

export function planCustomRule(text: string, form: CustomRuleForm, ruleIndex?: number) {
  const parsed = parseConfig(text);
  if (!parsed.config || hasDuplicateJsoncKeys(text) || parsed.unknown.some(({ path }) => path === 'route'))
    return blocked('draft');
  if (!customExits(parsed.config).includes(form.outbound)) return blocked('exit');
  const rules = parsed.config.route?.rules ?? [];
  const parent = ruleIndex === undefined ? undefined : rules[ruleIndex];
  const match = simpleTerminalConditions(parent);
  if (ruleIndex !== undefined && (!match?.key || !canAddDeviceException(parent))) return blocked('parent');
  if (
    match?.key === 'rule_set' &&
    match.entries?.some((tag) => parsed.config?.route?.rule_set?.filter((set) => set.tag === tag).length !== 1) === true
  )
    return blocked('parent');
  if (ruleIndex !== undefined && !isDeviceAddress(form.device)) return blocked('deviceRequired');
  const dest = match?.key ? { [match.key]: match.entries, source_ip_cidr: [form.device] } : simpleAddress(form.address);
  if (!dest) return blocked('invalid');
  const node = { ...dest, action: 'route', outbound: form.outbound };
  let index = rules.length;
  for (let i = 0; i < rules.length; i++) {
    const previous = rules[i];
    if (isServiceStep(previous)) continue;
    const relation = simpleRuleRelation(previous, node);
    if (relation === 'disjoint') continue;
    const reverse = simpleRuleRelation(node, previous);
    if (relation === 'covers') {
      if (reverse === 'covers') return blocked('duplicate', i + 1);
      index = i;
      break;
    }
    if (reverse !== 'covers') return blocked('unknown', i + 1);
  }
  const candidate = insertValue(text, [...RULES_PATH, index], node);
  if (candidate === null || parseConfig(candidate).config === null) return blocked('draft');
  return { ok: true, text: candidate, position: index + 1, before: index < rules.length } as const;
}
