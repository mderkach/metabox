import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

import { APPLY_BLOCK, type ApplyBlock } from '../lib/ConfigApply.lib';

const BLOCKED_TEXT = {
  [APPLY_BLOCK.Unreachable]: 'blocked.unreachable',
  [APPLY_BLOCK.NotLoaded]: 'blocked.notLoaded',
  [APPLY_BLOCK.LoadFailed]: 'blocked.loadFailed',
  [APPLY_BLOCK.Unparsed]: 'blocked.unparsed',
} as const satisfies Record<ApplyBlock['kind'], string>;

/** What stands in the way of Apply, in one line next to the disabled button; a failed read gets a retry. */
export function ConfigApplyBlocked({
  blocked,
  className,
  onRetry,
}: {
  blocked: ApplyBlock;
  className?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <p role='status' className={cn('text-xs text-muted-foreground', className)}>
      {t(BLOCKED_TEXT[blocked.kind], 'line' in blocked ? { line: blocked.line } : undefined)}
      {blocked.kind === APPLY_BLOCK.LoadFailed && onRetry !== undefined && (
        <Button variant='link' size='xs' className='ml-1 px-1' onClick={onRetry}>
          {t('source.retry', { ns: 'shared' })}
        </Button>
      )}
    </p>
  );
}
