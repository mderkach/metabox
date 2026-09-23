import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { sectionSize, type ConfigDocument } from '@entities/Config';
import { cn } from '@shared/lib/utils';

import { CONFIG_TAB_CLASS, CONFIG_TAB_SOON, CONFIG_TAB_UNDERLINE, CONFIG_TABS } from '../model';
import { ConfigModeSwitch } from './ConfigModeSwitch';

export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  // Подчёркивание идёт за завершённым адресом, а не за текущим: текущий роутер
  // меняет в начале навигации, а снимок «до» переход снимает в её конце — по
  // текущему полоса уже стояла бы под новой вкладкой, и переезжать было бы нечему.
  const resolvedPath = useRouterState({
    select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname,
  });

  return (
    <div className='flex shrink-0 items-stretch gap-3 border-b border-border px-4 [view-transition-name:config-tabs] sm:px-6'>
      <nav aria-label={t('label')} className='min-w-0 grow'>
        <ul className='flex h-11 items-end gap-1 overflow-x-auto'>
          {CONFIG_TABS.map((section) => {
            const count = sectionSize(config, section.key);

            return (
              <li key={section.key}>
                {section.route === null ? (
                  <span aria-disabled='true' title={t('unavailable')} className={cn(CONFIG_TAB_CLASS, 'font-normal')}>
                    <span className='text-muted-foreground'>{t(section.label)}</span>
                    {count !== null && <SectionCount count={count} />}
                    <span className={CONFIG_TAB_SOON}>{t('soon', { ns: 'shared' })}</span>
                  </span>
                ) : (
                  <Link
                    to={section.route}
                    activeOptions={{ exact: true }}
                    activeProps={{ 'aria-current': 'page' }}
                    className={cn(
                      CONFIG_TAB_CLASS,
                      'text-muted-foreground transition-colors hover:text-foreground',
                      'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      'aria-[current=page]:text-foreground'
                    )}
                  >
                    {t(section.label)}
                    {count !== null && <SectionCount count={count} />}
                    {section.route === resolvedPath && <span className={CONFIG_TAB_UNDERLINE} />}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className='flex shrink-0 items-center'>
        <ConfigModeSwitch />
      </div>
    </div>
  );
}

function SectionCount({ count }: { count: number }) {
  return <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>;
}
