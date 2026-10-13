import { CircleAlert, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { failureText, type MessageKey } from '../api';
import { cn } from '../lib/utils';
import { Button } from './shadcn/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './shadcn/empty';

/**
 * Failure of a block's data source: what was not read, why, and a retry.
 *
 * A separate state, not emptiness: an empty list after a failure reads as
 * "no data", and the user goes to fix a config that is intact. The reason is
 * the translation of the daemon code, and an unfamiliar code is shown as the error message
 * as is. Texts live in the `shared` namespace: the block is one for the whole application, and the
 * title matches the toast of the same failure.
 */
export function QueryFailure({
  messageKey,
  query,
}: {
  /** What was not read: the same key as the toast in the request's `meta`. */
  messageKey: MessageKey;
  query: { error: Error | null; isFetching: boolean; refetch: () => unknown };
}) {
  const { t } = useTranslation('shared');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>{t(messageKey)}</EmptyTitle>
        {query.error !== null && <EmptyDescription>{failureText(query.error) ?? query.error.message}</EmptyDescription>}
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant='outline'
          size='sm'
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          <RotateCw data-icon='inline-start' className={cn(query.isFetching && 'animate-spin')} />
          {query.isFetching ? t('source.retrying') : t('source.retry')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
