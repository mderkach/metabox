import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { CheckFailure } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/** Binary output is shown verbatim: the validity arbiter is it, not the panel. */
export function ConfigApplyCheck({ check }: { check: CheckFailure }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const output = [check.stderr, check.stdout].filter((part) => part.length > 0).join('\n');

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{t('check.title')}</AlertTitle>
      <AlertDescription>
        <pre className='font-mono text-xs whitespace-pre-wrap'>{output}</pre>
        <p className='text-xs'>{t('check.exitCode', { code: check.exitCode })}</p>
      </AlertDescription>
    </Alert>
  );
}
