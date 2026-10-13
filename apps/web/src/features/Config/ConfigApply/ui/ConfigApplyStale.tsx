import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@shared/ui';

import { ConfigApplyDiscard } from './ConfigApplyDiscard';

/**
 * The draft was started from a config that is already different on the device:
 * it was rewritten while the draft waited in the browser, or applied from
 * another tab. Applying will overwrite what changed on the device, so the user
 * decides.
 */
export function ConfigApplyStale({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <Alert className='max-sm:pr-2.5'>
      <TriangleAlert />
      <AlertTitle>{t('stale.title')}</AlertTitle>
      <AlertDescription>{t('stale.description')}</AlertDescription>
      {/* The primitive places the action absolutely in the corner; on a
          narrow screen it overlaps the title, so there it goes into the flow.
          */}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
        <ConfigApplyDiscard label={t('stale.discard')} onDiscard={onDiscard} />
      </AlertAction>
    </Alert>
  );
}
