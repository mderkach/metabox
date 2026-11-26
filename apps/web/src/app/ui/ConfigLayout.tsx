import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useConfigDocument } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { ConfigNodeAddDialogProvider, ConfigNodeAddDialogTrigger } from '@features/Config/ConfigNodeAdd';
import { DaemonModeSwitch } from '@features/Daemon/DaemonMode';
import { Badge } from '@shared/ui';
import { ConfigBuildNotice } from '@widgets/Config/ConfigBuildNotice';
import { ConfigViewTabs } from '@widgets/Config/ConfigTabs';
import { PageHeader } from '@widgets/PageHeader';

import { SchemaDriftNotice } from './SchemaDriftNotice';

export function ConfigLayout() {
  const { t } = useTranslation('app');
  const document = useConfigDocument();
  const configPath = useConfigPath();

  return (
    <ConfigNodeAddDialogProvider>
      <ConfigViewTabs
        config={document.config}
        renderHeader={(views, simple) => (
          <PageHeader
            className='items-center gap-y-2'
            title={t('section.config', { ns: 'shared' })}
            actions={
              <div className='flex min-w-0 flex-wrap items-center gap-2 max-xl:basis-full max-sm:grid max-sm:w-full max-sm:[&>button]:min-h-11'>
                <DaemonModeSwitch inHeader />
                <ConfigApplyHistory showLabel />
                <div className='contents xl:block xl:w-48 max-sm:[&>button]:min-h-11 xl:[&>button]:w-full'>
                  {simple && document.config !== null && document.text !== null && (
                    <ConfigNodeAddDialogTrigger label={t('addServer.action', { ns: 'pages/SimpleRoutes' })} />
                  )}
                </div>
              </div>
            }
          >
            {document.isDirty && <Badge variant='secondary'>{t('config.draft')}</Badge>}
            <div className='min-w-0 max-sm:basis-full'>{views}</div>
            {!simple && (
              <p className='order-last basis-full font-mono text-xs break-all text-muted-foreground'>{configPath}</p>
            )}
          </PageHeader>
        )}
      >
        <div className='flex shrink-0 flex-col gap-3 px-4 pt-4 empty:hidden sm:px-6'>
          <SchemaDriftNotice />
          <ConfigBuildNotice config={document.config} />
        </div>

        <Outlet />
      </ConfigViewTabs>
    </ConfigNodeAddDialogProvider>
  );
}
