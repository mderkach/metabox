import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Skeleton } from './shadcn/skeleton';
import { PENDING_REVEAL } from './styles';

const DEFAULT_ROWS = 6;

/**
 * Загрузка списка рядами скелетона. Появляется с задержкой (`PENDING_REVEAL`):
 * быстрый ответ заменяет её раньше, чем она станет видимой. Скринридеру
 * загрузка объявляется словом — ряды полос ему ничего не говорят.
 */
export function SkeletonRows({
  rows = DEFAULT_ROWS,
  className,
  rowClassName = 'h-5',
}: {
  rows?: number;
  className?: string;
  /** Высота ряда: у списка — строка, у графика — вся область. */
  rowClassName?: string;
}) {
  const { t } = useTranslation('shared');

  return (
    <div role='status' className={cn('flex flex-col gap-3 p-4', PENDING_REVEAL, className)}>
      <span className='sr-only'>{t('source.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} aria-hidden='true' className={rowClassName} />
      ))}
    </div>
  );
}
