import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

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
    return <p className='text-sm text-muted-foreground'>{t('pendingStream')}</p>;
  }

  if (filtered) {
    return (
      <div className='flex flex-col items-center gap-2'>
        <p className='text-sm text-muted-foreground'>{t('notFound')}</p>
        <Button variant='outline' size='sm' onClick={onReset}>
          {t('resetFilter')}
        </Button>
      </div>
    );
  }

  return <p className='text-sm text-muted-foreground'>{t('empty')}</p>;
}
