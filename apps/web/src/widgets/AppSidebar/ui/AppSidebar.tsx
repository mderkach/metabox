import { Link, useRouterState } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { pickActiveNav, useSidebarCollapsed } from '../lib/AppSidebar.lib';
import { NAV_ITEMS, NAV_TARGETS } from '../model';
import { AppSidebarControls } from './AppSidebarControls';

const ITEM_CLASS =
  'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

const LOGO_CLASS =
  'flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground';

const TOGGLE_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/** Кромка отличает текущий раздел от соседнего под курсором. */
const ACTIVE_CLASS =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary';

export function AppSidebar() {
  const { t } = useTranslation('widgets/AppSidebar');
  const sidebar = useSidebarCollapsed();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pickActiveNav(pathname, NAV_TARGETS);

  return (
    <aside
      aria-label={t('label')}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width]',
        sidebar.collapsed ? 'w-14' : 'w-58'
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border',
          sidebar.collapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        {sidebar.collapsed ? (
          <Logo expand={sidebar.toggle} />
        ) : (
          <>
            <Logo />
            <p className='grow text-base font-semibold tracking-tight'>metabox</p>
            <button
              type='button'
              onClick={sidebar.toggle}
              aria-label={t('nav.collapse')}
              aria-expanded
              className={TOGGLE_CLASS}
            >
              <PanelLeftClose className='size-4' />
            </button>
          </>
        )}
      </div>

      <nav aria-label={t('nav.label')} className='p-2.5'>
        <ul className='flex flex-col gap-0.5'>
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              {item.to !== undefined ? (
                <Link
                  to={item.to}
                  title={t(item.key, { ns: 'shared' })}
                  // Ссылка сама помечает себя текущей по префиксу адреса; точное
                  // совпадение оставляет это ей, а вложенные пути решает `active`.
                  activeOptions={{ exact: true }}
                  aria-current={item.to === active ? 'page' : undefined}
                  className={cn(
                    ITEM_CLASS,
                    sidebar.collapsed && 'justify-center px-0',
                    item.to === active
                      ? ACTIVE_CLASS
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  )}
                >
                  <item.icon className='size-4 shrink-0' />
                  {!sidebar.collapsed && t(item.key, { ns: 'shared' })}
                </Link>
              ) : (
                <span
                  aria-disabled='true'
                  title={t('nav.unavailable', { section: t(item.key, { ns: 'shared' }) })}
                  className={cn(ITEM_CLASS, sidebar.collapsed && 'justify-center px-0', 'text-muted-foreground')}
                >
                  <item.icon className='size-4 shrink-0' />
                  {!sidebar.collapsed && (
                    <>
                      <span className='grow truncate'>{t(item.key, { ns: 'shared' })}</span>
                      <span className='shrink-0 rounded-sm bg-muted px-1 text-2xs tracking-wide text-muted-foreground uppercase'>
                        {t('soon', { ns: 'shared' })}
                      </span>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <footer
        className={cn(
          'mt-auto flex shrink-0 border-t border-sidebar-border',
          sidebar.collapsed ? 'flex-col items-center gap-2 px-2 py-3' : 'flex-col gap-3 px-4 py-3.5'
        )}
      >
        <AppSidebarControls collapsed={sidebar.collapsed} />
      </footer>
    </aside>
  );
}

/** `expand` пуст у развёрнутой панели: разворачивать нечего, логотип — только знак. */
function Logo({ expand }: { expand?: () => void }) {
  const { t } = useTranslation('widgets/AppSidebar');
  if (expand === undefined) {
    return (
      <span title='metabox' className={LOGO_CLASS}>
        m
      </span>
    );
  }

  return (
    <button
      type='button'
      onClick={expand}
      aria-label={t('nav.expand')}
      aria-expanded={false}
      className={cn(
        LOGO_CLASS,
        'group transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
      )}
    >
      <span className='group-hover:hidden group-focus-visible:hidden'>m</span>
      <PanelLeftOpen className='hidden size-4 group-hover:block group-focus-visible:block' />
    </button>
  );
}
