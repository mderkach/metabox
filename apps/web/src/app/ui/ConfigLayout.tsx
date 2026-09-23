import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useConfigDocument } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { Badge } from '@shared/ui';
import { ConfigTabs } from '@widgets/Config/ConfigTabs';
import { PageHeader } from '@widgets/PageHeader';

/**
 * Оболочка раздела конфигурации: шапка, полоса вкладок и содержимое вкладки.
 *
 * Шапка и полоса живут здесь, а не на каждом экране раздела: при переходе
 * между вкладками меняется только содержимое, поэтому заголовок, путь файла,
 * бейдж черновика и диалог истории версий переход переживают.
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

      <Outlet />
    </>
  );
}
