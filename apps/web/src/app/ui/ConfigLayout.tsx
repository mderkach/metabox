import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useConfigDocument } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { Badge } from '@shared/ui';
import { ConfigBuildNotice } from '@widgets/Config/ConfigBuildNotice';
import { ConfigTabs } from '@widgets/Config/ConfigTabs';
import { PageHeader } from '@widgets/PageHeader';

import { SchemaDriftNotice } from './SchemaDriftNotice';

/**
 * Shell of the configuration section: header, tab strip and tab content.
 *
 * The header and the strip live here, not on every section screen: on a switch
 * between tabs only the content changes, so the title, the file path, the draft
 * badge and the version history dialog survive the transition.
 */
export function ConfigLayout() {
  const { t } = useTranslation('app');
  const document = useConfigDocument();
  const configPath = useConfigPath();

  return (
    <>
      <PageHeader title={t('section.config', { ns: 'shared' })} actions={<ConfigApplyHistory />}>
        <p className='font-mono text-xs text-muted-foreground'>{configPath}</p>
        {document.isDirty && <Badge variant='secondary'>{t('config.draft')}</Badge>}
      </PageHeader>

      <ConfigTabs config={document.config} />

      <div className='flex shrink-0 flex-col gap-3 px-4 pt-4 empty:hidden sm:px-6'>
        <SchemaDriftNotice />
        <ConfigBuildNotice config={document.config} />
      </div>

      <Outlet />
    </>
  );
}
