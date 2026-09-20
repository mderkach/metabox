import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

/**
 * «Пусто» и «пусто из-за отбора» — разные экраны: во втором есть кнопка,
 * возвращающая список.
 */
export function ConnectionsEmpty({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  const { t } = useTranslation('pages/Connections');

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
