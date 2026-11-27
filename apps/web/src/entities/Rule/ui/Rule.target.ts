import type { TFunction } from 'i18next';

import type { SHARED_NS } from '@shared/i18n';

import { isNamedRuleAction } from '../model/Rule.constants';
import { RULE_TARGET, type RuleRow } from '../model/Rule.model';

export function ruleActionLabel(rule: Pick<RuleRow, 'targetKind' | 'target'>, t: TFunction<typeof SHARED_NS>) {
  return rule.targetKind === RULE_TARGET.Action && isNamedRuleAction(rule.target)
    ? t(`ruleAction.${rule.target}`)
    : null;
}
