import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device/@x/rule';

import { toRuleCaption } from '../model/Rule.caption';
import { isNamedRuleAction, isNamedRuleMatcher } from '../model/Rule.constants';
import { RULE_TARGET, type RuleRow } from '../model/Rule.model';

export interface RuleTitle {
  /** The name, or "main condition → outbound" derived from the content. */
  title: (rule: RuleRow) => string;
  /** The name, or the main condition alone: for a line that names the outbound itself. */
  subject: (rule: RuleRow) => string;
}

/**
 * How the panel calls a rule: by the name from the comment above it, and
 * without one by its content. The number goes last: it changes on reorder.
 * A rule whose fields the panel does not know has nothing to show, so it keeps
 * its number.
 */
export function useRuleTitle(): RuleTitle {
  const { t } = useTranslation('shared');
  const devices = useDeviceIndex();

  return useMemo(() => {
    const deviceOf = (address: string) => (devices.has(address) ? deviceLabel(address, devices) : null);

    const subject = (rule: RuleRow): string => {
      if (rule.name !== null) return rule.name;

      const { key, condition, more } = toRuleCaption(rule, deviceOf);

      if (key === null || condition === null) {
        return rule.recognized ? t('rule.allTraffic') : t('rule.numbered', { index: rule.index });
      }

      // A flag (`ip_is_private: true`) says nothing by its value: the condition is named instead.
      if (condition === String(true) || condition === String(false)) {
        const matcher = isNamedRuleMatcher(key) ? t(`matcher.${key}`) : key;

        return condition === String(true) ? matcher : t('rule.flagOff', { matcher });
      }

      return more > 0 ? t('rule.conditionMore', { condition, more }) : condition;
    };

    const title = (rule: RuleRow): string => {
      const own = subject(rule);

      // An unknown rule with nothing to show keeps its number alone, without an outbound after it.
      if (rule.name !== null || own === t('rule.numbered', { index: rule.index })) return own;

      const target =
        rule.targetKind === RULE_TARGET.Action && isNamedRuleAction(rule.target)
          ? t(`ruleAction.${rule.target}`)
          : rule.target;

      return t('rule.caption', { subject: own, target });
    };

    return { title, subject };
  }, [t, devices]);
}
