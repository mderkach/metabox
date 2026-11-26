import { Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useClashConfigs } from '@entities/Daemon';
import { failureText } from '@shared/api';
import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@shared/ui';

import { useSetClashMode } from '../api';
import { toClashModeLabel } from './DaemonMode.labels';

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
export function DaemonModeSwitch({ inHeader = false }: { inHeader?: boolean }) {
  const { t } = useTranslation('shared');
  const clash = useClashConfigs();
  const setMode = useSetClashMode();

  if (inHeader && (clash.data?.modeList.length ?? 0) <= 1) return null;

  if (clash.isPending) {
    return <Skeleton aria-hidden='true' className={cn('h-8 w-32', PENDING_REVEAL)} />;
  }

  if (clash.data === undefined) {
    const reason = failureText(clash.error) ?? clash.error.message;

    return <span className='text-sm text-muted-foreground'>{t('clashMode.unavailable', { reason })}</span>;
  }

  const { mode, modeList } = clash.data;
  const current = toClashModeLabel(t, mode);
  const label = t(inHeader ? 'clashMode.routing' : 'clashMode.label');

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
      <SelectTrigger
        aria-label={`${label}: ${current}`}
        className={cn('min-w-0', inHeader && 'max-sm:w-full sm:max-w-48')}
      >
        {inHeader && (
          <>
            <Route aria-hidden className='hidden sm:block' />
            <span className='text-muted-foreground sm:sr-only'>{label}</span>
          </>
        )}
        <SelectValue className={inHeader ? 'min-w-0' : undefined} placeholder={current}>
          {inHeader ? <span className='truncate'>{current}</span> : undefined}
        </SelectValue>
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
