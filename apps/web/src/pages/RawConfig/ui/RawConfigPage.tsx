import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, useConfigDirty } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { Alert, AlertDescription, AlertTitle, Badge, Button, buttonVariants } from '@shared/ui';
import { ConfigRawEditor } from '@widgets/Config/ConfigRawEditor';
import { PageHeader } from '@widgets/PageHeader';

import { useRawConfig } from '../lib/RawConfig.lib';

export function RawConfigPage() {
  const { t } = useTranslation('pages/RawConfig');
  const raw = useRawConfig();
  const configPath = useConfigPath();
  const replace = ConfigDocumentState.use.replace();
  const discard = ConfigDocumentState.use.discard();
  const isDirty = useConfigDirty();

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            <Button variant='outline' size='sm' disabled={!isDirty} onClick={discard}>
              {t('reset')}
            </Button>
            <Link to='/config' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('toForms')}
            </Link>
          </>
        }
      >
        <p className='font-mono text-xs text-muted-foreground'>{configPath}</p>
        {isDirty && <Badge variant='secondary'>{t('draft')}</Badge>}
      </PageHeader>

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
    </>
  );
}
