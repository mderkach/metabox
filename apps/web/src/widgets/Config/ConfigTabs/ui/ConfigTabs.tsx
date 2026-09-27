import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { sectionSize, type ConfigDocument } from '@entities/Config';
import { Tabs, TabsList, TabsTrigger } from '@shared/ui';

import { CONFIG_TABS, tabPath } from '../model';
import { ConfigModeSwitch } from './ConfigModeSwitch';

/**
 * Секции конфигурации — вкладки-ссылки: у каждой свой адрес, поэтому вкладка
 * открывается и в новой вкладке браузера, а выбранную задаёт адрес, а не
 * состояние полосы.
 */
export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = CONFIG_TABS.find((section) => tabPath(section) === pathname)?.key ?? null;

  return (
    <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-1.5 [view-transition-name:config-tabs] sm:px-6'>
      <Tabs value={current} className='max-w-full min-w-0'>
        <TabsList variant='line' aria-label={t('label')} className='max-w-full justify-start overflow-x-auto'>
          {CONFIG_TABS.map((section) => {
            const count = sectionSize(config, section.key);

            return (
              <TabsTrigger
                key={section.key}
                value={section.key}
                nativeButton={false}
                render={<Link {...section.link} activeOptions={{ exact: true }} />}
                className='flex-none'
              >
                {t(section.label)}
                {count !== null && <SectionCount count={count} />}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className='ml-auto'>
        <ConfigModeSwitch />
      </div>
    </div>
  );
}

function SectionCount({ count }: { count: number }) {
  return <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>;
}
