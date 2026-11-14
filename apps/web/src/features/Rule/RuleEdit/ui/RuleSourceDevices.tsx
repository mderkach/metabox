import { TriangleAlert } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useDeviceIndex } from '@entities/Device';

import { dynamicSourceNames } from '../model/RuleEdit.model';
import { conditionLines, RULE_CONDITION, type RuleEditModel } from '../model/RuleEdit.schema';

const FIELD = `conditions.${RULE_CONDITION.SourceIpCidr}` as const;

/**
 * Warning under a source condition. sing-box matches the source by address,
 * so a device goes into the node as `source_ip_cidr` with its address, while
 * its name is shown on the chip. A device with a dynamic lease may get another
 * address, and the rule will stop recognizing it.
 */
export function RuleSourceDevices() {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();
  const text = useWatch({ control, name: FIELD });
  const devices = useDeviceIndex({ poll: true });
  const dynamic = dynamicSourceNames(conditionLines(text), devices);

  if (dynamic.length === 0) {
    return null;
  }

  return (
    <ul aria-label={t('device.dynamicList')} className='flex flex-col gap-1 text-xs'>
      {dynamic.map((name) => (
        <li key={name} className='flex items-start gap-1.5 text-pretty text-signal-warn'>
          <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
          {t('device.dynamic', { name })}
        </li>
      ))}
    </ul>
  );
}
