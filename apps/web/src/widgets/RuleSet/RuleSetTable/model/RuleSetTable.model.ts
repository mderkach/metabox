import { RULE_SET_TYPE, type RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';

export function isEditable(set: RuleSetRowModel): boolean {
  return set.type === RULE_SET_TYPE.Remote && set.recognized && set.tag !== '';
}
