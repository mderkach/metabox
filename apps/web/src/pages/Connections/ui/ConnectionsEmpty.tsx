import { useTranslation } from 'react-i18next';

import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle, SkeletonRows } from '@shared/ui';

/**
 * Состояния пустого списка.
 *
 * «Ждём снимок» отделён от «пусто»: до первого кадра потока про соединения
 * ничего не известно, и фраза «соединений нет» в этот момент — неправда.
 * «Пусто из-за отбора» — третий экран, у него есть кнопка, возвращающая список.
 */
export function ConnectionsEmpty({
  filtered,
  pending,
  onReset,
}: {
  filtered: boolean;
  /** Поток ещё не прислал ни одного снимка. */
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
