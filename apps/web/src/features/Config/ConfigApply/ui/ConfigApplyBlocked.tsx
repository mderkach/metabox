import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { APPLY_BLOCK, type ApplyBlock } from '../lib/ConfigApply.lib';

const BLOCKED_TEXT = {
  [APPLY_BLOCK.Unreachable]: 'blocked.unreachable',
  [APPLY_BLOCK.NotLoaded]: 'blocked.notLoaded',
  [APPLY_BLOCK.Unparsed]: 'blocked.unparsed',
} as const satisfies Record<ApplyBlock['kind'], string>;

/** What stands in the way of Apply, in one line next to the disabled button. */
export function ConfigApplyBlocked({ blocked, className }: { blocked: ApplyBlock; className?: string }) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <p role='status' className={cn('text-xs text-muted-foreground', className)}>
      {t(BLOCKED_TEXT[blocked.kind], blocked)}
    </p>
  );
}
