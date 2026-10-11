import { useTranslation } from 'react-i18next';

import { DELAY_FAST, DELAY_STATE } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { DELAY_TONE } from './ProxyDelayTone';

/** Пороги тона задержки словами: по одному цвету граница между 290 и 310 мс не видна. */
export function ProxyGroupsLegend() {
  const { t } = useTranslation('widgets/ProxyGroups');
  const entries = [
    { state: DELAY_STATE.Fast, label: t('legend.fast', { value: DELAY_FAST }) },
    { state: DELAY_STATE.Slow, label: t('legend.slow', { value: DELAY_FAST }) },
    { state: DELAY_STATE.Failed, label: t('delay.timedOut', { ns: 'shared' }) },
  ];

  return (
    <ul
      aria-label={t('legend.label')}
      className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'
    >
      {entries.map((entry) => (
        <li key={entry.state} className='flex items-center gap-1.5'>
          <span aria-hidden='true' className={cn('size-2 rounded-full bg-current', DELAY_TONE[entry.state])} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
