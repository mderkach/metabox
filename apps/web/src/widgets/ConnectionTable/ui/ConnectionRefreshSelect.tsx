import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { REFRESH_INTERVAL, type RefreshInterval } from '../lib';

const REFRESH_OPTIONS = [
  { interval: REFRESH_INTERVAL.Live, label: 'refresh.live' },
  { interval: REFRESH_INTERVAL.Slow, label: 'refresh.slow' },
  { interval: REFRESH_INTERVAL.Slower, label: 'refresh.slower' },
] as const satisfies readonly { interval: RefreshInterval; label: ParseKeys<'widgets/ConnectionTable'> }[];

function toInterval(value: string | null): RefreshInterval {
  const option = REFRESH_OPTIONS.find((entry) => String(entry.interval) === value);

  return option === undefined ? REFRESH_INTERVAL.Live : option.interval;
}

/**
 * Refresh rate of the shown rows. View control, so it stands next to
 * density, not in the action row: pause stops the screen entirely and stays
 * a separate button.
 *
 * Values are strings: `Select` works with a string value, not a number.
 */
export function ConnectionRefreshSelect({
  interval,
  onIntervalChange,
}: {
  interval: RefreshInterval;
  onIntervalChange: (interval: RefreshInterval) => void;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  // Without `items` the trigger prints the value itself — milliseconds instead of a label.
  const items = REFRESH_OPTIONS.map((option) => ({ value: String(option.interval), label: t(option.label) }));

  return (
    <Select
      items={items}
      value={String(interval)}
      onValueChange={(value: string | null) => {
        onIntervalChange(toInterval(value));
      }}
    >
      <SelectTrigger size='sm' className='w-20' aria-label={t('refresh.label')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REFRESH_OPTIONS.map((option) => (
          <SelectItem key={option.interval} value={String(option.interval)}>
            {t(option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
