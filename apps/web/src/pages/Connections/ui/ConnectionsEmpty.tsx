import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle, SkeletonRows } from '@shared/ui';

import { CONNECTIONS_NS } from '../i18n/Connections.namespace.generated';

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
  const { t } = useTranslation(CONNECTIONS_NS);

  if (pending) {
    return <SkeletonRows className='w-full self-start' />;
  }

  if (filtered) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('list.notFound', { ns: SHARED_NS })}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant='outline' size='sm' onClick={onReset}>
            {t('list.resetFilter', { ns: SHARED_NS })}
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
