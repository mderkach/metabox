import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useConfigDocument } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { ConfigNodeAddDialogProvider, ConfigNodeAddDialogTrigger } from '@features/Config/ConfigNodeAdd';
import { cn } from '@shared/lib/utils';
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
            className={simple ? 'items-center gap-y-2' : undefined}
            title={t('section.config', { ns: 'shared' })}
            actions={
              <div className={cn('flex min-w-0 flex-wrap items-center gap-2', simple && 'max-sm:w-full')}>
                <ConfigApplyHistory showLabel={simple} />
                {simple && document.config !== null && document.text !== null && (
                  <ConfigNodeAddDialogTrigger label={t('addServer.action', { ns: 'pages/SimpleRoutes' })} />
                )}
              </div>
            }
          >
            {!simple && (
              <p className='font-mono text-xs break-all text-muted-foreground max-sm:order-last max-sm:basis-full'>
                {configPath}
              </p>
            )}
            <div
              className={cn(
                'min-w-0',
                simple ? 'max-sm:basis-full' : 'order-last basis-full border-t border-border pt-2'
              )}
            >
              {views}
            </div>
            {document.isDirty && <Badge variant='secondary'>{t('config.draft')}</Badge>}
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
