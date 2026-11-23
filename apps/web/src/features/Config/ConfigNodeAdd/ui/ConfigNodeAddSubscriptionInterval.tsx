import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FieldLegend, FieldSet, Label } from '@shared/ui';

import type { ConnectionLinkModel } from '../model/ConfigNodeAdd.schema';
import { MAX_INTERVAL, SUBSCRIPTION_INTERVALS, SUBSCRIPTION_INTERVAL_UNITS } from '../model/ConfigNodeAdd.subscription';
import { ConfigNodeAddSubscriptionInput } from './ConfigNodeAddSubscriptionInput';
import { ConfigNodeAddSubscriptionSelect } from './ConfigNodeAddSubscriptionSelect';

const UNIT_LABEL = { m: 'minutes', h: 'hours', d: 'days' } as const;
const INTERVAL_LABEL = {
  '5m': 'fiveMinutes',
  '15m': 'fifteenMinutes',
  '1h': 'oneHour',
  '24h': 'oneDay',
  custom: 'customInterval',
} as const;

export function ConfigNodeAddSubscriptionInterval() {
  const { t } = useTranslation('features/Config/ConfigNodeAdd');
  const { control } = useFormContext<ConnectionLinkModel>();
  const [interval, unit] = useWatch({ control, name: ['interval', 'intervalUnit'] });

  return (
    <FieldSet className='min-w-0 gap-2'>
      <FieldLegend variant='label'>{t('subscription.interval')}</FieldLegend>
      <Controller
        control={control}
        name='interval'
        render={({ field }) => (
          <div className='grid grid-cols-3 gap-1.5 sm:grid-cols-5'>
            {SUBSCRIPTION_INTERVALS.map((value) => (
              <Label
                key={value}
                className='relative min-h-8 cursor-pointer justify-center rounded-lg border border-input px-2 text-center text-sm last:col-span-2 has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 sm:last:col-span-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11'
              >
                <input
                  className='absolute inset-0 size-full cursor-pointer opacity-0'
                  type='radio'
                  name={field.name}
                  value={value}
                  checked={field.value === value}
                  onChange={() => {
                    field.onChange(value);
                  }}
                />
                {t(`subscription.${INTERVAL_LABEL[value]}`)}
              </Label>
            ))}
          </div>
        )}
      />
      {interval === 'custom' && (
        <div className='grid min-w-0 grid-cols-2 items-start gap-2 motion-safe:animate-in motion-safe:fade-in'>
          <ConfigNodeAddSubscriptionInput
            name='intervalValue'
            label={t('subscription.intervalValue')}
            inputMode='numeric'
            max={MAX_INTERVAL[unit]}
          />
          <ConfigNodeAddSubscriptionSelect
            name='intervalUnit'
            label={t('subscription.intervalUnit')}
            items={SUBSCRIPTION_INTERVAL_UNITS.map((value) => ({
              value,
              label: t(`subscription.${UNIT_LABEL[value]}`),
            }))}
          />
          <p className='col-span-full text-xs text-muted-foreground'>{t('subscription.intervalMinimum')}</p>
        </div>
      )}
    </FieldSet>
  );
}
