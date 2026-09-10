import { Activity, Boxes, Gauge, PanelLeftClose, PanelLeftOpen, Share2, SlidersHorizontal } from 'lucide-react';

import { useDaemonStatus } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';

import { useSidebarCollapsed } from '../lib/AppSidebar.lib';

const NAV_ITEMS = [
  { key: 'overview', label: 'Обзор', icon: Gauge, ready: false },
  {
    key: 'config',
    label: 'Конфигурация',
    icon: SlidersHorizontal,
    ready: true,
  },
  { key: 'ruleSets', label: 'Каталог rule-set', icon: Boxes, ready: false },
  { key: 'proxies', label: 'Прокси', icon: Share2, ready: false },
  { key: 'connections', label: 'Соединения', icon: Activity, ready: false },
] as const;

export function AppSidebar() {
  const status = useDaemonStatus();
  const sidebar = useSidebarCollapsed();

  return (
    <div
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
            <div className='flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground'>
              m
            </div>
            <div className='grow text-sm font-semibold tracking-tight'>metabox</div>
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

      <nav className='flex flex-col gap-0.5 p-2.5'>
        {NAV_ITEMS.map((item) => (
          <span
            key={item.key}
            aria-disabled={!item.ready}
            aria-current={item.ready ? 'page' : undefined}
            title={item.ready ? item.label : `${item.label} — раздел ещё не сделан`}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-lg text-sm',
              sidebar.collapsed ? 'justify-center px-0' : 'px-2.5',
              item.ready ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground/60'
            )}
          >
            <item.icon className='size-4 shrink-0' />
            {!sidebar.collapsed && item.label}
          </span>
        ))}
      </nav>

      <div className='grow' />

      {!sidebar.collapsed && (
        <div className='border-t border-border px-4 py-3.5'>
          <span className='truncate text-xs text-muted-foreground'>
            {status.isSuccess ? <span className='font-mono'>{status.data.version}</span> : 'демон не отвечает'}
          </span>
        </div>
      )}
    </div>
  );
}
