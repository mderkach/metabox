import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { sectionSize, type ConfigDocument } from '@entities/Config';
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shared/ui';

import { CONFIG_TABS } from '../model';
import { ConfigModeSwitch } from './ConfigModeSwitch';

const READY_TABS = CONFIG_TABS.filter((section) => section.route !== null);
const SOON_TABS = CONFIG_TABS.filter((section) => section.route === null);

/**
 * Секции конфигурации — вкладки-ссылки: у каждой свой адрес, поэтому вкладка
 * открывается и в новой вкладке браузера, а выбранную задаёт адрес, а не
 * состояние полосы.
 *
 * Секции без экрана собраны в одну кнопку со списком: шесть отключённых
 * вкладок с меткой «скоро» не помещались в полосу и на 1440, а выбрать среди
 * них всё равно нечего.
 */
export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = READY_TABS.find((section) => section.route === pathname)?.key ?? null;

  return (
    <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-1.5 [view-transition-name:config-tabs] sm:px-6'>
      <Tabs value={current} className='max-w-full min-w-0'>
        <TabsList variant='line' aria-label={t('label')} className='max-w-full justify-start overflow-x-auto'>
          {READY_TABS.map((section) => {
            const count = sectionSize(config, section.key);

            return (
              <TabsTrigger
                key={section.key}
                value={section.key}
                nativeButton={false}
                render={<Link to={section.route} activeOptions={{ exact: true }} />}
                className='flex-none'
              >
                {t(section.label)}
                {count !== null && <SectionCount count={count} />}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <SoonSections config={config} />

      <div className='ml-auto'>
        <ConfigModeSwitch />
      </div>
    </div>
  );
}

function SoonSections({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');

  return (
    <Popover>
      <PopoverTrigger render={<Button variant='ghost' size='sm' className='shrink-0 text-muted-foreground' />}>
        {t('soon.trigger', { count: SOON_TABS.length })}
        <ChevronDown data-icon='inline-end' />
      </PopoverTrigger>

      <PopoverContent align='start' className='w-64'>
        <PopoverTitle>{t('soon.title')}</PopoverTitle>
        <ul className='mt-2 flex flex-col gap-1.5 text-sm'>
          {SOON_TABS.map((section) => {
            const count = sectionSize(config, section.key);

            return (
              <li key={section.key} className='flex items-center gap-2'>
                <span className='grow'>{t(section.label)}</span>
                {count !== null && <SectionCount count={count} />}
                <Badge variant='secondary'>{t('soon', { ns: 'shared' })}</Badge>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function SectionCount({ count }: { count: number }) {
  return <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>;
}
