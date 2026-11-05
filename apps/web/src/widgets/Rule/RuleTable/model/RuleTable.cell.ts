import { RULE_HIT, type RuleHitCell } from './';

export function toHitCell(counts: ReadonlyMap<string, number | null>, id: string): RuleHitCell {
  if (!counts.has(id)) {
    return RULE_HIT.Edited;
  }

  return counts.get(id) ?? RULE_HIT.Unobserved;
}
