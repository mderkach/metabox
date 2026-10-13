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
 * Config sections are link tabs: each has its own address, so a tab
 * also opens in a new browser tab, and the selected one is set by the address, not by
 * the strip state.
 *
 * The strip has frequent sections and the selected one, the rest are in the "More" menu beside it.
 * At a narrow width the strip scrolls, the edge with hidden tabs fades out
 * with a gradient, and the selected tab scrolls to the middle of the visible part.
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

      // Narrowing of the type does not reach the functions below: the declaration is hoisted.
      const strip = scroller;
      const activeTab = tab;

      // The shift is computed by hand, not by `scrollIntoView`: that one scrolls
      // ancestors too, and the screen would move vertically to the strip. The tab is placed in
      // the middle, not at the edge: the strip edges fade out with a gradient.
      function center() {
        const box = strip.getBoundingClientRect();
        const rect = activeTab.getBoundingClientRect();

        strip.scrollLeft += rect.left - box.left - (box.width - rect.width) * HALF;
      }

      // Tab widths change after the first frame: the font loads,
      // the document with counters arrives, and the selected one is shifted by neighbors on the left.
      // The observer is on the tabs, not on the strip: its width stays put.
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
