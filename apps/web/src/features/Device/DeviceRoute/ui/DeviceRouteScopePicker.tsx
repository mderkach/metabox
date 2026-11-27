import { useTranslation } from 'react-i18next';

import type { DataplaneModel } from '@entities/Dataplane';
import { Checkbox } from '@shared/ui';

import { DEVICE_ROUTE_NS } from '../i18n/DeviceRoute.namespace.generated';
import { deviceSelected, type ScopeDevice } from '../model/DeviceRoute.scope';

export function DeviceRouteScopePicker({
  rows,
  model,
  disabled,
  onChange,
}: {
  rows: readonly ScopeDevice[];
  model: DataplaneModel;
  disabled: boolean;
  onChange: (device: ScopeDevice, selected: boolean) => void;
}) {
  const { t } = useTranslation(DEVICE_ROUTE_NS);
  return (
    <details className='min-w-0'>
      <summary className='w-fit cursor-pointer rounded-sm py-1 font-medium text-primary focus-visible:outline-ring pointer-coarse:min-h-11'>
        {t('scope.pick')}
      </summary>
      <fieldset
        aria-label={t('scope.pick')}
        className='mt-1 grid min-w-0 divide-y divide-border rounded-lg border px-3'
      >
        {rows.map((device) => (
          <label key={device.key} className='flex cursor-pointer items-center gap-3 py-2 pointer-coarse:min-h-11'>
            <Checkbox
              disabled={disabled}
              checked={deviceSelected(model, device)}
              onCheckedChange={(checked) => {
                onChange(device, checked);
              }}
            />
            <span className='grid min-w-0 gap-0.5 wrap-anywhere'>
              <span>{device.label}</span>
              <span className='font-mono text-xs text-muted-foreground'>
                {[device.ip, device.mac].filter((value) => value !== '' && value !== device.label).join(' · ')}
              </span>
              {device.missing && <span className='text-xs text-muted-foreground'>{t('scope.missing')}</span>}
            </span>
          </label>
        ))}
        {rows.length === 0 && <p className='py-2 text-muted-foreground'>{t('scope.noDevices')}</p>}
      </fieldset>
    </details>
  );
}
