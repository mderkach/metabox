import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { pickActiveNav } from '../lib/AppSidebar.lib';
import { NAV_ITEMS, NAV_TARGETS } from '../model';
import { AppSidebarMore } from './AppSidebarMore';

/** Высота 56px: цель касания не меньше 44px и по высоте, и по ширине колонки. */
const ITEM_CLASS =
  'relative flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset';

const IDLE_CLASS = 'text-muted-foreground hover:text-foreground';

/** Разделы листа «Ещё»: когда открыт один из них, текущим помечен сам пункт «Ещё». */
const MORE_TARGETS: readonly string[] = NAV_ITEMS.flatMap((item) =>
  item.more === true && item.to !== undefined ? [item.to] : []
);

/** Кромка сверху отличает текущий раздел не только цветом. */
const ACTIVE_CLASS =
  'font-medium text-foreground before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary';

/**
 * Навигация телефона: разделы внизу экрана, под большим пальцем. Боковой
 * панели на этой ширине нет, поэтому её подвал уезжает в лист «Ещё».
 * Стоит в потоке раскладки, а не `fixed`: экран над ней получает остаток
 * высоты и под панелью не прячется.
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
          // Несделанному разделу и пункту листа «Ещё» колонку не отдаём:
          // ширины телефона хватает на пять.
          item.to === undefined || item.more === true ? null : (
            <li key={item.key} className='min-w-0 flex-1'>
              <Link
                to={item.to}
                // Как в сайдбаре: вложенные пути решает `active`, а не ссылка.
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
