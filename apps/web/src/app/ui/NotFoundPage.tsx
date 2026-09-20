import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * Заглушка неизвестного пути. Заменяет `Outlet` оболочки (`notFoundComponent`
 * на корневом маршруте), поэтому рендерится внутри `AppLayout` вместе с
 * сайдбаром — переход по неверному адресу не теряет навигацию панели.
 */
export function NotFoundPage() {
  const { t } = useTranslation('app');

  return (
    <div className='flex min-h-0 grow flex-col items-center justify-center gap-3 px-6 py-5 text-center'>
      <h1 className='text-2xl font-semibold'>{t('notFound.title')}</h1>
      <p className='max-w-md text-sm text-muted-foreground'>{t('notFound.message')}</p>
      <Link to='/config' className='text-sm font-medium text-primary underline-offset-4 hover:underline'>
        {t('notFound.back')}
      </Link>
    </div>
  );
}
