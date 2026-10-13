import { Eraser } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { LOG_SOURCE } from '@entities/Log';
import { Button, DESTRUCTIVE_OUTLINE } from '@shared/ui';

import { useClearLog } from '../api';

/**
 * Clear with a hint of what exactly is cleared: with `logread` the logd ring is
 * not cleared, and without the hint lines that return after a daemon restart
 * would read as a malfunction.
 */
export function LogClearButton({ source }: { source: string | null }) {
  const { t } = useTranslation('features/Log/LogClear');
  const clear = useClearLog();
  const hintId = useId();
  const hint = source === LOG_SOURCE.File ? t('hint.file') : t('hint.logread');

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
      <p id={hintId} className='max-w-prose text-xs text-pretty text-muted-foreground'>
        {hint}
      </p>
      <Button
        variant='outline'
        size='sm'
        className={DESTRUCTIVE_OUTLINE}
        aria-describedby={hintId}
        disabled={clear.isPending}
        onClick={() => {
          clear.mutate();
        }}
      >
        <Eraser data-icon='inline-start' />
        {clear.isPending ? t('pending') : t('action')}
      </Button>
    </div>
  );
}
