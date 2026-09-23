import { CircleAlert, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { failureText, type MessageKey } from '../api';
import { cn } from '../lib/utils';
import { Button } from './shadcn/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './shadcn/empty';

/**
 * Отказ источника данных блока: что не прочиталось, почему и повтор.
 *
 * Отдельное состояние, а не пустота: пустой список после отказа читается как
 * «данных нет», и пользователь уходит чинить конфиг, который цел. Причина —
 * перевод кода демона, а незнакомый код показывается сообщением ошибки как
 * есть. Тексты живут в неймспейсе `shared`: блок один на всё приложение, а
 * заголовок совпадает с тостом того же отказа.
 */
export function QueryFailure({
  messageKey,
  query,
}: {
  /** Что не прочиталось: тот же ключ, что у тоста в `meta` запроса. */
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
