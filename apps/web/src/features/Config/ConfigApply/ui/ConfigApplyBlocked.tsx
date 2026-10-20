import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { APPLY_BLOCK, type ApplyBlock } from '../lib/ConfigApply.lib';

/** What stands in the way of Apply, in one line next to the disabled button. */
export function ConfigApplyBlocked({ blocked, className }: { blocked: ApplyBlock; className?: string }) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <p role='status' className={cn('text-xs text-muted-foreground', className)}>
      {blocked.kind === APPLY_BLOCK.Unreachable ? t('blocked.unreachable') : t('blocked.unparsed', blocked)}
    </p>
  );
}
