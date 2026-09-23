import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { sectionSize, type ConfigDocument } from '@entities/Config';
import { Badge, Tabs, TabsList, TabsTrigger } from '@shared/ui';

import { CONFIG_TABS } from '../model';
import { ConfigModeSwitch } from './ConfigModeSwitch';

/**
 * Секции конфигурации — вкладки-ссылки: у каждой свой адрес, поэтому вкладка
 * открывается и в новой вкладке браузера, а выбранную задаёт адрес, а не
 * состояние полосы.
 */
export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = CONFIG_TABS.find((section) => section.route === pathname)?.key ?? null;

  return (
    <div className='flex shrink-0 items-center gap-3 border-b border-border px-4 py-1.5 [view-transition-name:config-tabs] sm:px-6'>
      <Tabs value={current} className='min-w-0 grow'>
        <TabsList variant='line' aria-label={t('label')} className='max-w-full justify-start overflow-x-auto'>
          {CONFIG_TABS.map((section) => {
            const count = sectionSize(config, section.key);

            return section.route === null ? (
              <TabsTrigger key={section.key} value={section.key} disabled className='flex-none'>
                {t(section.label)}
                {count !== null && <SectionCount count={count} />}
                <Badge variant='secondary'>{t('soon', { ns: 'shared' })}</Badge>
              </TabsTrigger>
            ) : (
              <TabsTrigger
                key={section.key}
                value={section.key}
                nativeButton={false}
                render={<Link to={section.route} />}
                className='flex-none'
              >
                {t(section.label)}
                {count !== null && <SectionCount count={count} />}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <ConfigModeSwitch />
    </div>
  );
}

function SectionCount({ count }: { count: number }) {
  return <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>;
}
