import { Link, useRouterState } from '@tanstack/react-router';
import { CircleHelp, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';

import { APP_SIDEBAR_NS } from '../i18n/AppSidebar.namespace.generated';
import { pickActiveNav, useSidebarCollapsed } from '../lib/AppSidebar.lib';
import type { SidebarNavigation } from '../model';
import { AppSidebarControls } from './AppSidebarControls';
import { AppSidebarLogo } from './AppSidebarLogo';

const ITEM_CLASS =
  'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

const TOGGLE_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/** The edge distinguishes the current section from a neighbor under the cursor. */
const ACTIVE_CLASS =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary';

export function AppSidebar({ navigation }: { navigation: SidebarNavigation }) {
  const { t } = useTranslation(APP_SIDEBAR_NS);
  const sidebar = useSidebarCollapsed();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pickActiveNav(pathname, navigation.targets);

  const isHelpActive = active === navigation.help.to;

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
          <AppSidebarLogo expand={sidebar.toggle} />
        ) : (
          <>
            <AppSidebarLogo />
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
          {navigation.sections.map((item) => (
            <li key={item.key}>
              {item.to !== undefined ? (
                <Link
                  to={item.to}
                  title={t(item.key, { ns: SHARED_NS })}
                  // The link marks itself current by address prefix; an exact
                  // match leaves that to it, and nested paths are decided by `active`.
                  activeOptions={{ exact: true }}
                  aria-current={(item.match ?? item.to) === active ? 'page' : undefined}
                  className={cn(
                    ITEM_CLASS,
                    sidebar.collapsed && 'justify-center px-0',
                    (item.match ?? item.to) === active
                      ? ACTIVE_CLASS
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  )}
                >
                  <item.icon className='size-4 shrink-0' />
                  {!sidebar.collapsed && t(item.key, { ns: SHARED_NS })}
                </Link>
              ) : (
                <span
                  aria-disabled='true'
                  title={t('nav.unavailable', { section: t(item.key, { ns: SHARED_NS }) })}
                  className={cn(ITEM_CLASS, sidebar.collapsed && 'justify-center px-0', 'text-muted-foreground')}
                >
                  <item.icon className='size-4 shrink-0' />
                  {!sidebar.collapsed && (
                    <>
                      <span className='grow truncate'>{t(item.key, { ns: SHARED_NS })}</span>
                      <span className='shrink-0 rounded-sm bg-muted px-1 text-xs tracking-wide text-muted-foreground uppercase'>
                        {t('soon', { ns: SHARED_NS })}
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
        <Link
          to={navigation.help.to}
          title={t('nav.help')}
          aria-label={sidebar.collapsed ? t('nav.help') : undefined}
          activeOptions={{ exact: true }}
          aria-current={isHelpActive ? 'page' : undefined}
          className={cn(
            ITEM_CLASS,
            sidebar.collapsed ? 'w-full justify-center px-0' : '-mx-1.5',
            isHelpActive ? ACTIVE_CLASS : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
          )}
        >
          <CircleHelp className='size-4 shrink-0' aria-hidden='true' />
          {!sidebar.collapsed && t('nav.help')}
        </Link>
        <AppSidebarControls collapsed={sidebar.collapsed} />
      </footer>
    </aside>
  );
}
