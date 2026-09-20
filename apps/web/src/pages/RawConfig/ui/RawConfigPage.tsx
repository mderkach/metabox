import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, useConfigDocument } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';
import { ConfigRawEditor } from '@widgets/Config/ConfigRawEditor';

/**
 * Весь конфиг текстом.
 *
 * Отката правок у экрана своего нет: документом владеет бар применения, и
 * «Отменить правки» там же, где диф и применение.
 */
export function RawConfigPage() {
  const { t } = useTranslation('pages/RawConfig');
  const raw = useConfigDocument();
  const replace = ConfigDocumentState.use.replace();

  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
      {raw.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

      {raw.notParsed && (
        <Alert>
          <AlertTitle>{t('rejected.title')}</AlertTitle>
          <AlertDescription>{t('rejected.description')}</AlertDescription>
        </Alert>
      )}

      {raw.text !== null && (
        <ConfigRawEditor key={raw.revision} text={raw.text} onChange={replace} issues={raw.issues} />
      )}
    </div>
  );
}
