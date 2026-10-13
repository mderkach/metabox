import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CACHE_FILE_PATH, ConfigDocumentState } from '@entities/Config';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@shared/ui';

/**
 * The set cache is off, and the config has a remote set.
 *
 * Without the cache core goes to the network for the set on every start, and an
 * unavailable provider aborts the launch entirely: not "a rule will not fire"
 * but no routing at all. The warning concerns the config, not an individual
 * set, so it stands above the list as a single instance.
 *
 * The panel does not append the section silently: someone else's config is not
 * edited without asking, and the button puts it into the same draft that the
 * user will see as a diff before applying.
 */
export function ConfigCacheNotice() {
  const { t } = useTranslation('features/Config/ConfigCacheFile');
  const edit = ConfigDocumentState.use.edit();

  return (
    <Alert variant='destructive' className='max-sm:pr-2.5'>
      <TriangleAlert />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{t('description')}</AlertDescription>
      {/* The primitive places the action absolutely in the top right
          corner; on a narrow screen it overlaps the title, so there it goes
          into the flow. */}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
        <Button
          size='sm'
          onClick={() => {
            edit(CACHE_FILE_PATH, true);
          }}
        >
          {t('enable')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
