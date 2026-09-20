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
 * Частота обновления показанных строк. Управление видом, поэтому стоит рядом с
 * плотностью, а не в ряду действий: пауза останавливает экран совсем и остаётся
 * отдельной кнопкой.
 *
 * Значения — строки: `Select` работает со строковым значением, а не с числом.
 */
export function ConnectionRefreshSelect({
  interval,
  onIntervalChange,
}: {
  interval: RefreshInterval;
  onIntervalChange: (interval: RefreshInterval) => void;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  // Без `items` триггер печатает само значение — миллисекунды вместо подписи.
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
