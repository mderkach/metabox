import { useTranslation } from 'react-i18next';

import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle, SkeletonRows } from '@shared/ui';

/**
 * Empty list states.
 *
 * "Waiting for a snapshot" is separate from "empty": before the first stream
 * frame nothing is known about connections, and the phrase "no connections" is
 * untrue at that moment. "Empty because of selection" is the third screen, with
 * a button that brings the list back.
 */
export function ConnectionsEmpty({
  filtered,
  pending,
  onReset,
}: {
  filtered: boolean;
  /** The stream has not sent a single snapshot yet. */
  pending: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation('pages/Connections');

  if (pending) {
    return <SkeletonRows className='w-full self-start' />;
  }

  if (filtered) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('list.notFound', { ns: 'shared' })}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant='outline' size='sm' onClick={onReset}>
            {t('list.resetFilter', { ns: 'shared' })}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
