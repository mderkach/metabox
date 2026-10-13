import { useTranslation } from 'react-i18next';

import { useClashConfigs } from '@entities/Daemon';
import { failureText } from '@shared/api';
import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@shared/ui';

import { useSetClashMode } from '../api';
import { toClashModeLabel } from './clashModeLabel';

/**
 * Runtime routing mode. It has no apply bar or confirmation: the config file
 * does not change.
 *
 * A dropdown, not segments: the mode set is open, since sing-box adds the
 * `clash_mode` values from config rules to the three built-in ones, and
 * segments for such a set would not fit the phone width.
 *
 * While the mode is being read, a skeleton; if it was not read, the reason as
 * text instead of the control: there is nothing to choose from.
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
