import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { sectionSize, type ConfigDocument } from '@entities/Config';
import { cn } from '@shared/lib/utils';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shared/ui';

import { useScrollEdges } from '../lib';
import { CONFIG_TABS, CONFIG_TABS_FREQUENT, tabPath } from '../model';
import { ConfigModeSwitch } from './ConfigModeSwitch';

const HALF = 0.5;

/**
 * Секции конфигурации — вкладки-ссылки: у каждой свой адрес, поэтому вкладка
 * открывается и в новой вкладке браузера, а выбранную задаёт адрес, а не
 * состояние полосы.
 *
 * В полосе частые секции и выбранная, остальные — в меню «Ещё» рядом с ней.
 * На узкой ширине полоса прокручивается, край со скрытыми вкладками гаснет
 * градиентом, а выбранная вкладка прокручивается в середину видимой части.
 */
export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = CONFIG_TABS.find((section) => tabPath(section) === pathname)?.key ?? null;
  const shown = CONFIG_TABS.filter((section) => CONFIG_TABS_FREQUENT.has(section.key) || section.key === current);
  const more = CONFIG_TABS.filter((section) => !CONFIG_TABS_FREQUENT.has(section.key) && section.key !== current);
  const list = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(list, current);

  useEffect(
    function centerCurrentTab() {
      const scroller = list.current;
      const tab = scroller?.querySelector('[data-active]');

      if (!scroller || !tab) {
        return;
      }

      // Функциям ниже сужение типа не доходит: объявление поднимается.
      const strip = scroller;
      const activeTab = tab;

      // Сдвиг считается руками, а не `scrollIntoView`: тот прокручивает и
      // предков, и экран уехал бы по вертикали к полосе. Вкладка встаёт в
      // середину, а не к краю: края полосы гаснут градиентом.
      function center() {
        const box = strip.getBoundingClientRect();
        const rect = activeTab.getBoundingClientRect();

        strip.scrollLeft += rect.left - box.left - (box.width - rect.width) * HALF;
      }

      // Ширина вкладок меняется после первого кадра: подгружается шрифт,
      // приходит документ со счётчиками, и выбранную сдвигают соседи слева.
      // Наблюдатель на вкладках, а не на полосе: её ширина при этом стоит.
      const observer = new ResizeObserver(center);

      for (const each of strip.children) {
        observer.observe(each);
      }

      return function stopCenteringCurrentTab() {
        observer.disconnect();
      };
    },
    [current]
  );

  return (
    <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-1.5 [view-transition-name:config-tabs] sm:px-6'>
      <div className='flex max-w-full min-w-0 items-center gap-1'>
        <Tabs value={current} className='min-w-0'>
          <TabsList
            ref={list}
            variant='line'
            aria-label={t('label')}
            className={cn(
              'max-w-full justify-start overflow-x-auto',
              edges.start && 'mask-l-from-85%',
              edges.end && 'mask-r-from-85%'
            )}
          >
            {shown.map((section) => {
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

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant='ghost' size='sm' className='shrink-0 text-muted-foreground' />}>
            {t('more')}
            <ChevronDown data-icon='inline-end' />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-auto'>
            {more.map((section) => {
              const count = sectionSize(config, section.key);

              return (
                <DropdownMenuItem
                  key={section.key}
                  render={<Link {...section.link} />}
                  className='justify-between gap-4'
                >
                  {t(section.label)}
                  {count !== null && <SectionCount count={count} />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className='ml-auto'>
        <ConfigModeSwitch />
      </div>
    </div>
  );
}

function SectionCount({ count }: { count: number }) {
  return <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>;
}
