import { useTranslation } from 'react-i18next';

import type { DeviceIndex } from '@entities/Device';
import type { TokenSuggestion } from '@shared/ui';

import { COMMON_PORTS, lanSubnets } from '../model/RuleEdit.model';
import { RULE_CONDITION, type RuleCondition } from '../model/RuleEdit.schema';

/** What the condition field offers while typing; `undefined` for a condition without suggestions. */
export function useConditionSuggestions(condition: RuleCondition, devices: DeviceIndex): TokenSuggestion[] | undefined {
  const { t } = useTranslation('features/Rule/RuleEdit');

  if (condition === RULE_CONDITION.Port) {
    return COMMON_PORTS.map((port) => ({ value: port, hint: t(`suggestion.port.${port}`) }));
  }

  if (condition === RULE_CONDITION.IpCidr || condition === RULE_CONDITION.SourceIpCidr) {
    return lanSubnets(devices).map((subnet) => ({
      value: subnet.cidr,
      hint: t('suggestion.lan', { count: subnet.devices }),
    }));
  }

  return undefined;
}
