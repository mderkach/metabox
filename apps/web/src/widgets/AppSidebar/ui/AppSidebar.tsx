import { Link } from '@tanstack/react-router';
import { Activity, Boxes, Gauge, PanelLeftClose, PanelLeftOpen, Share2, SlidersHorizontal } from 'lucide-react';

import { useDaemonStatus } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';

import { useSidebarCollapsed } from '../lib/AppSidebar.lib';

/** `to` есть только у сделанных разделов: остальные пункты не кликаются. */
const NAV_ITEMS = [
  { key: 'overview', label: 'Обзор', icon: Gauge, to: '/overview' },
  { key: 'config', label: 'Конфигурация', icon: SlidersHorizontal, to: '/config' },
  { key: 'ruleSets', label: 'Каталог rule-set', icon: Boxes },
  { key: 'proxies', label: 'Прокси', icon: Share2, to: '/proxies' },
  { key: 'connections', label: 'Соединения', icon: Activity, to: '/connections' },
] as const;

const ITEM_CLASS = 'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm';

export function AppSidebar() {
  const status = useDaemonStatus();
  const sidebar = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width]',
        sidebar.collapsed ? 'w-14' : 'w-58'
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-border',
          sidebar.collapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        {!sidebar.collapsed && (
          <>
            <span className='flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground'>
              m
            </span>
            <p className='grow text-sm font-semibold tracking-tight'>metabox</p>
          </>
        )}
        <button
          type='button'
          onClick={sidebar.toggle}
          aria-label={sidebar.collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          aria-expanded={!sidebar.collapsed}
          className='flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
        >
          {sidebar.collapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
        </button>
      </div>

      <nav aria-label='Разделы панели' className='p-2.5'>
        <ul className='flex flex-col gap-0.5'>
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              {'to' in item ? (
                <Link
                  to={item.to}
                  title={item.label}
                  className={cn(
                    ITEM_CLASS,
                    sidebar.collapsed && 'justify-center px-0',
                    'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  activeProps={{ className: 'bg-muted font-medium text-foreground' }}
                >
                  <item.icon className='size-4 shrink-0' />
                  {!sidebar.collapsed && item.label}
                </Link>
              ) : (
                <span
                  aria-disabled='true'
                  title={`${item.label} — раздел ещё не сделан`}
                  className={cn(ITEM_CLASS, sidebar.collapsed && 'justify-center px-0', 'text-muted-foreground/60')}
                >
                  <item.icon className='size-4 shrink-0' />
                  {!sidebar.collapsed && item.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {!sidebar.collapsed && (
        <footer className='mt-auto border-t border-border px-4 py-3.5'>
          <p className='truncate text-xs text-muted-foreground'>
            {status.isSuccess ? <span className='font-mono'>{status.data.version}</span> : 'демон не отвечает'}
          </p>
        </footer>
      )}
    </aside>
  );
}
