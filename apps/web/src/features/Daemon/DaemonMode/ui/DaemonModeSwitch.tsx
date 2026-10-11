import { useTranslation } from 'react-i18next';

import { useClashConfigs } from '@entities/Daemon';
import { failureText } from '@shared/api';
import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@shared/ui';

import { useSetClashMode } from '../api';
import { toClashModeLabel } from './clashModeLabel';

/**
 * Режим маршрутизации рантайма. Бара применения и подтверждения у него нет:
 * файл конфига не меняется.
 *
 * Выпадающий список, а не сегменты: набор режимов открытый — sing-box добавляет
 * к трём встроенным значения `clash_mode` из правил конфига, — и сегменты под
 * такой набор не помещались бы в ширину телефона.
 *
 * Пока режим читается — скелетон; не прочитан — причина текстом вместо
 * контрола: выбирать не из чего.
 */
export function DaemonModeSwitch() {
  const { t } = useTranslation('shared');
  const clash = useClashConfigs();
  const setMode = useSetClashMode();

  if (clash.isPending) {
    return <Skeleton aria-hidden='true' className={cn('h-8 w-32', PENDING_REVEAL)} />;
  }

  if (clash.data === undefined) {
    const reason = failureText(clash.error) ?? clash.error.message;

    return <span className='text-sm text-muted-foreground'>{t('clashMode.unavailable', { reason })}</span>;
  }

  const { mode, modeList } = clash.data;
  const current = toClashModeLabel(t, mode);

  return (
    <Select
      items={modeList.map((value) => ({ value, label: toClashModeLabel(t, value) }))}
      value={mode}
      onValueChange={(value: string | null) => {
        if (value !== null && value !== mode) {
          setMode.mutate(value);
        }
      }}
    >
      <SelectTrigger aria-label={`${t('clashMode.label')}: ${current}`} className='min-w-0'>
        <SelectValue placeholder={current} />
      </SelectTrigger>
      <SelectContent>
        {modeList.map((value) => (
          <SelectItem key={value} value={value}>
            {toClashModeLabel(t, value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
