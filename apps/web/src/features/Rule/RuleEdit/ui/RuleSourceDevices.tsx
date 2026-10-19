import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex, type DeviceIndex } from '@entities/Device';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { conditionLines, RULE_CONDITION, type RuleEditModel } from '../model/RuleEdit.schema';

const FIELD = `conditions.${RULE_CONDITION.SourceIpCidr}` as const;

/** Mask of one address: a rule by device is a rule by its whole address. */
const HOST_PREFIX = { V4: '/32', V6: '/128' } as const;

function toHostCidr(ip: string): string {
  return `${ip}${ip.includes(':') ? HOST_PREFIX.V6 : HOST_PREFIX.V4}`;
}

/** Address of a condition line if the line is exactly one host; a subnet does not count as a device. */
function toHostIp(line: string): string {
  return line.endsWith(HOST_PREFIX.V4) || line.endsWith(HOST_PREFIX.V6) ? line.slice(0, line.lastIndexOf('/')) : line;
}

interface SourceLine {
  line: string;
  label: string;
  /** The address was issued by a dynamic lease and may change. */
  dynamic: boolean;
}

function toSourceLines(text: string, devices: DeviceIndex): SourceLine[] {
  return conditionLines(text).flatMap((line) => {
    const ip = toHostIp(line);
    const device = devices.get(ip);

    return device === undefined ? [] : [{ line, label: deviceLabel(ip, devices), dynamic: !device.static }];
  });
}

/**
 * Device choice for a source condition. sing-box matches the source by address,
 * so `source_ip_cidr` with the device address goes into the node, while the
 * name stays a label in the form. A device with a dynamic lease may get another
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
  const lines = toSourceLines(text, devices);
  const options = [...devices.values()];

  if (options.length === 0 && lines.length === 0) {
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

      {lines.length > 0 && (
        <ul aria-label={t('device.chosen')} className='flex flex-col gap-1 text-xs'>
          {lines.map(({ line, label, dynamic }) => (
            <li key={line} className='flex flex-col gap-0.5'>
              <span>
                {label} <span className='font-mono text-muted-foreground'>{line}</span>
              </span>
              {dynamic && (
                <span className='flex items-start gap-1.5 text-pretty text-signal-warn'>
                  <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
                  {t('device.dynamic')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
