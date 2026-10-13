import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { pickActiveNav } from '../lib/AppSidebar.lib';
import { NAV_ITEMS, NAV_TARGETS } from '../model';
import { AppSidebarMore } from './AppSidebarMore';

/** Height 56px: the touch target is at least 44px both in height and in column width. */
const ITEM_CLASS =
  'relative flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset';

const IDLE_CLASS = 'text-muted-foreground hover:text-foreground';

/** Sections of the "More" sheet: when one of them is open, the "More" item itself is marked current. */
const MORE_TARGETS: readonly string[] = NAV_ITEMS.flatMap((item) =>
  item.more === true && item.to !== undefined ? [item.to] : []
);

/** The top edge distinguishes the current section by more than color. */
const ACTIVE_CLASS =
  'font-medium text-foreground before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary';

/**
 * Phone navigation: sections at the bottom of the screen, under the thumb. The sidebar
 * does not exist at this width, so its footer moves into the "More" sheet.
 * Sits in the layout flow, not `fixed`: the screen above it gets the remaining
 * height and does not hide under the bar.
 */
export function AppSidebarBottomNav() {
  const { t } = useTranslation('widgets/AppSidebar');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pickActiveNav(pathname, NAV_TARGETS);

  return (
    <nav
      aria-label={t('nav.label')}
      className='shrink-0 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)]'
    >
      <ul className='flex'>
        {NAV_ITEMS.map((item) =>
          // An unfinished section and the "More" sheet item do not get a column:
          // the phone width is enough for five.
          item.to === undefined || item.more === true ? null : (
            <li key={item.key} className='min-w-0 flex-1'>
              <Link
                to={item.to}
                // As in the sidebar: nested paths are decided by `active`, not the link.
                activeOptions={{ exact: true }}
                aria-current={item.to === active ? 'page' : undefined}
                className={cn(ITEM_CLASS, item.to === active ? ACTIVE_CLASS : IDLE_CLASS)}
              >
                <item.icon aria-hidden='true' className='size-5 shrink-0' />
                <span className='max-w-full truncate'>
                  {item.short === undefined ? t(item.key, { ns: 'shared' }) : t(item.short)}
                </span>
              </Link>
            </li>
          )
        )}
        <li className='min-w-0 flex-1'>
          <AppSidebarMore
            active={active}
            className={cn(ITEM_CLASS, MORE_TARGETS.includes(active ?? '') ? ACTIVE_CLASS : IDLE_CLASS)}
          />
        </li>
      </ul>
    </nav>
  );
}
