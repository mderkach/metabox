import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/**
 * The `experimental.clash_api` section is appended by the daemon: without it
 * there is nothing to read the runtime with, and the user is shown this as
 * someone else's edit in their file.
 */
export function ConfigApplyClashApiAdded() {
  const { t } = useTranslation('features/Config/ConfigApply');
  return (
    <Alert>
      <Info />
      <AlertTitle>{t('clashApi.title')}</AlertTitle>
      <AlertDescription>{t('clashApi.description')}</AlertDescription>
    </Alert>
  );
}
