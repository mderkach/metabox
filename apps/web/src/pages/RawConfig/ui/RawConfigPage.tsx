import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, useConfigDocument } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';
import { ConfigRawEditor } from '@widgets/Config/ConfigRawEditor';

/**
 * The whole config as text.
 *
 * The screen has no edit rollback of its own: the document is owned by the apply bar, and
 * "Discard changes" is there, next to the diff and apply.
 */
export function RawConfigPage() {
  const { t } = useTranslation('pages/RawConfig');
  const raw = useConfigDocument();
  const replace = ConfigDocumentState.use.replace();

  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
      {raw.query.isPending && <SkeletonRows className={SURFACE} />}

      {raw.query.isLoadingError && <QueryFailure messageKey='source.config' query={raw.query} />}

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
