import type { ErrorComponentProps } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { failureText } from '@shared/api';
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/ui';

/**
 * Ошибка, которую раздел не обработал сам. Отказы источников разделы
 * показывают своими блоками, сюда доходит сбой самой панели. Пользователю
 * важно, что с роутером ничего не случилось и что делать дальше; текст
 * исключения нужен только для отчёта и лежит под раскрытием. Сайдбар
 * остаётся: граница стоит внутри оболочки.
 */
export function ErrorPage({ error }: ErrorComponentProps) {
  const { t } = useTranslation('app');
  const reason = failureText(error);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>
          <h1>{t('error.unknown', { ns: 'shared' })}</h1>
        </EmptyTitle>
        <EmptyDescription>{reason ?? t('error.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            globalThis.location.reload();
          }}
        >
          {t('error.reload')}
        </Button>
        {error instanceof Error && (
          <details className='w-full text-left text-xs text-muted-foreground'>
            <summary className='cursor-pointer'>{t('error.details')}</summary>
            <pre className='mt-2 overflow-x-auto font-mono whitespace-pre-wrap'>{error.message}</pre>
          </details>
        )}
      </EmptyContent>
    </Empty>
  );
}
