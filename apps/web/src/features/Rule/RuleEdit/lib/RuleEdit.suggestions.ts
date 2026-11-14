import { useTranslation } from 'react-i18next';

import type { DeviceIndex } from '@entities/Device';
import type { TokenSuggestion } from '@shared/ui';

import { COMMON_PORTS, sourceSuggestions, toHostCidr } from '../model/RuleEdit.model';
import { RULE_CONDITION, type RuleCondition } from '../model/RuleEdit.schema';

/**
 * What the condition field offers for its chips; `undefined` for a condition
 * without suggestions. The source field lists devices and local networks in
 * two groups; a device shows its name, and its chip is its address.
 */
export function useConditionSuggestions(
  condition: RuleCondition,
  devices: DeviceIndex
): ((chips: readonly string[]) => TokenSuggestion[]) | undefined {
  const { t } = useTranslation('features/Rule/RuleEdit');

  if (condition === RULE_CONDITION.Port) {
    return () => COMMON_PORTS.map((port) => ({ value: port, hint: t(`suggestion.port.${port}`) }));
  }

  if (condition === RULE_CONDITION.SourceIpCidr) {
    return (chips) => {
      const offered = sourceSuggestions(devices, chips);

      return [
        ...offered.devices.map((device) => ({
          value: toHostCidr(device.ip),
          ...(device.label !== device.ip && { label: device.label, hint: device.ip }),
          group: t('suggestion.group.devices'),
        })),
        ...offered.networks.map((network) => ({
          value: network.cidr,
          hint: t('suggestion.lan', { count: network.devices }),
          group: t('suggestion.group.networks'),
        })),
      ];
    };
  }

  return undefined;
}
