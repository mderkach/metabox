import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useDeviceIndex } from '@entities/Device';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { dynamicSourceNames, toHostCidr } from '../model/RuleEdit.model';
import { conditionLines, RULE_CONDITION, type RuleEditModel } from '../model/RuleEdit.schema';

const FIELD = `conditions.${RULE_CONDITION.SourceIpCidr}` as const;

/**
 * Device choice for a source condition. sing-box matches the source by address,
 * so `source_ip_cidr` with the device address goes into the node, while the
 * name is shown on its chip. A device with a dynamic lease may get another
 * address, and the rule will stop recognizing it: the form warns about this.
 */
export function RuleSourceDevices() {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control, getValues } = useFormContext<RuleEditModel>();
  const text = useWatch({ control, name: FIELD });
  // A pick goes through the field change, as typed text does: the form writes
  // only user changes to the draft, and `setValue` does not count as one.
  const { field } = useController({ control, name: FIELD });
  const devices = useDeviceIndex({ poll: true });
  const pickId = useId();
  const dynamic = dynamicSourceNames(conditionLines(text), devices);
  const options = [...devices.values()];

  if (options.length === 0 && dynamic.length === 0) {
    return null;
  }

  return (
    <div className='flex flex-col gap-1.5'>
      {options.length > 0 && (
        <>
          <Label htmlFor={pickId} className='sr-only'>
            {t('device.pick')}
          </Label>
          <Select
            value={null}
            onValueChange={(ip: string | null) => {
              if (ip === null) {
                return;
              }

              const current = conditionLines(getValues(FIELD));
              const cidr = toHostCidr(ip);

              if (!current.includes(cidr)) {
                field.onChange([...current, cidr].join('\n'));
              }
            }}
          >
            <SelectTrigger id={pickId} size='sm' className='self-start'>
              <SelectValue placeholder={t('device.pick')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((device) => (
                <SelectItem key={device.ip} value={device.ip}>
                  {device.label === device.ip ? device.ip : `${device.label} · ${device.ip}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {dynamic.length > 0 && (
        <ul aria-label={t('device.dynamicList')} className='flex flex-col gap-1 text-xs'>
          {dynamic.map((name) => (
            <li key={name} className='flex items-start gap-1.5 text-pretty text-signal-warn'>
              <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
              {t('device.dynamic', { name })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
