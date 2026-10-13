import type { ErrorComponentProps } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { failureText } from '@shared/api';
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/ui';

/**
 * An error the section did not handle itself. Sections show source failures in
 * their own blocks; what arrives here is a failure of the panel itself. The
 * user needs to know that nothing happened to the router and what to do next;
 * the exception text is needed only for a report and sits under a disclosure.
 * The sidebar stays: the boundary is inside the shell.
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
