import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfigLeaveGuard } from '@entities/Config';
import { ConfigApplyBar } from '@features/Config/ConfigApply';
import { useNarrowScreen } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import { AppSidebar, AppSidebarBottomNav } from '@widgets/AppSidebar';

import { useRuntimeStreams } from '../lib/useRuntimeStreams';
import { DaemonBanner } from './DaemonBanner';

/** Primary tone and position over the layout: the link must not get lost under the sidebar. */
const SKIP_LINK_CLASS =
  'sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * Shell of all screens. Navigation lives here, not on the page: it is shared by
 * all routes, and remounting it on transition would reset the collapsed state.
 * On a narrow screen the sidebar is replaced by a bottom bar: the content gets
 * the full width.
 */
export function AppLayout() {
  useRuntimeStreams();
  useConfigLeaveGuard();
  const { t } = useTranslation('app');
  const narrow = useNarrowScreen();
  const [applySpace, setApplySpace] = useState(0);

  return (
    // `viewport-fit=cover` gives the panel the whole screen, including side
    // cutouts in landscape orientation: paddings keep the content outside them.
    <div
      className={cn(
        'flex h-full bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-foreground',
        narrow && 'flex-col'
      )}
    >
      <a href='#content' className={SKIP_LINK_CLASS}>
        {t('skip.content')}
      </a>
      {!narrow && <AppSidebar />}
      <div className='flex min-h-0 min-w-0 grow flex-col'>
        <DaemonBanner />
        <div className='relative flex min-h-0 grow flex-col'>
          {/* The screen is its own View Transitions group for the router
              transition; a `<ViewTransition>` boundary around `Outlet` would
              not work. The bottom padding is space under the floating apply
              bar: without it the bar would cover the bottom of the screen. */}
          <main
            id='content'
            tabIndex={-1}
            style={{ paddingBottom: applySpace }}
            className='flex min-h-0 grow flex-col [view-transition-name:page]'
          >
            <Outlet />
          </main>
          <ConfigApplyBar onSpaceChange={setApplySpace} />
        </div>
      </div>
      {narrow && <AppSidebarBottomNav />}
    </div>
  );
}
