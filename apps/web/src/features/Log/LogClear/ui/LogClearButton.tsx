import { Eraser } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { LOG_SOURCE } from '@entities/Log';
import { Button, DESTRUCTIVE_OUTLINE } from '@shared/ui';

import { useClearLog } from '../api';

/**
 * Clear with a hint of what exactly is cleared. With `logread` the logd ring
 * stays and lines only hide in the panel, so the action is named and toned as
 * hiding, not as an irreversible clear.
 */
export function LogClearButton({ source }: { source: string | null }) {
  const { t } = useTranslation('features/Log/LogClear');
  const clear = useClearLog();
  const hintId = useId();
  const file = source === LOG_SOURCE.File;

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
      <p id={hintId} className='max-w-prose text-xs text-pretty text-muted-foreground'>
        {file ? t('hint.file') : t('hint.logread')}
      </p>
      <Button
        variant='outline'
        size='sm'
        className={file ? DESTRUCTIVE_OUTLINE : undefined}
        aria-describedby={hintId}
        disabled={clear.isPending}
        onClick={() => {
          clear.mutate();
        }}
      >
        <Eraser data-icon='inline-start' />
        {clear.isPending ? t('pending') : t(file ? 'action' : 'actionHide')}
      </Button>
    </div>
  );
}
