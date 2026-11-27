import { useTranslation } from 'react-i18next';

import { Empty, EMPTY_INLINE, EmptyDescription, EmptyHeader, SkeletonRows } from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { CoreGap } from '../lib';
import { toCoreGapText } from './Overview.trafficText';

/** Stands in place of a block whose core data will not arrive or is not current; `null` means it is still loading. */
export function OverviewCoreGap({ gap }: { gap: CoreGap | null }) {
  const { t } = useTranslation(OVERVIEW_NS);

  if (gap === null) {
    return <SkeletonRows rows={2} className='p-0' />;
  }

  return (
    <Empty className={EMPTY_INLINE}>
      <EmptyHeader>
        <EmptyDescription>{toCoreGapText(t, gap)}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
