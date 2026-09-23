import { Skeleton, SkeletonRows } from '@shared/ui';

/**
 * Экран, данные которого ещё не пришли, когда роутер уже ждёт дольше
 * `defaultPendingMs`. Раскладка общая: у экранов она разная, а скелетон
 * отвечает только на вопрос «идёт загрузка», не притворяясь их содержимым.
 */
export function PendingPage() {
  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
      <Skeleton aria-hidden='true' className='h-5 w-2/3 max-w-md' />
      <SkeletonRows className='rounded-xl ring-1 ring-foreground/10' />
    </div>
  );
}
