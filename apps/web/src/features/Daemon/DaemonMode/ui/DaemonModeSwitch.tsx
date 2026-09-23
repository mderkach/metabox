import type { TFunction } from 'i18next';
import { Waypoints } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useClashConfigs } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { useSetClashMode } from '../api';
import { toClashModeLabel } from './clashModeLabel';

/**
 * Режим маршрутизации рантайма. Бара применения и подтверждения у него нет:
 * файл конфига не меняется. Пока режим не прочитан, выбирать не из чего, и
 * переключатель заблокирован — отказ рантайма объясняет подпись, а не пустое поле.
 *
 * `compact` — полоса значков свёрнутого сайдбара: подпись уходит в имя кнопки.
 */
export function DaemonModeSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('shared');
  const clash = useClashConfigs();
  const setMode = useSetClashMode();

  const mode = clash.data?.mode ?? null;
  const modes = clash.data?.modeList ?? [];
  const current = toCurrentLabel(t, mode, clash.isPending);
  const name = `${t('clashMode.label')}: ${current}`;

  const select = (
    <Select
      items={modes.map((value) => ({ value, label: toClashModeLabel(t, value) }))}
      value={mode}
      disabled={mode === null}
      onValueChange={(value: string | null) => {
        if (value !== null && value !== mode) {
          setMode.mutate(value);
        }
      }}
    >
      <SelectTrigger
        size='sm'
        aria-label={name}
        title={name}
        className={cn(compact ? 'size-7 justify-center p-0 [&>svg:last-child]:hidden' : 'min-w-0 text-xs')}
      >
        {compact ? <Waypoints aria-hidden='true' /> : <SelectValue placeholder={current} />}
      </SelectTrigger>
      <SelectContent>
        {modes.map((value) => (
          <SelectItem key={value} value={value}>
            {toClashModeLabel(t, value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) {
    return select;
  }

  return (
    <div className='flex items-center justify-between gap-2 text-xs'>
      <span aria-hidden='true' className='text-muted-foreground'>
        {t('clashMode.short')}
      </span>
      {select}
    </div>
  );
}

/** Пока ответа нет, режим ещё читается, а не недоступен: это разные состояния. */
function toCurrentLabel(t: TFunction<'shared'>, mode: string | null, pending: boolean): string {
  if (mode !== null) {
    return toClashModeLabel(t, mode);
  }

  return pending ? t('clashMode.pending') : t('clashMode.unavailable');
}
