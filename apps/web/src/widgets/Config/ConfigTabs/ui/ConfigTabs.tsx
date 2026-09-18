import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { sectionSize, type ConfigDocument } from '@entities/Config';
import { cn } from '@shared/lib/utils';

import { CONFIG_TAB_CLASS, CONFIG_TAB_UNDERLINE, CONFIG_TABS } from '../model';

export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');

  return (
    <nav aria-label={t('label')} className='shrink-0 border-b border-border'>
      <ul className='flex h-11 items-end gap-1 overflow-x-auto px-4 sm:px-6'>
        {CONFIG_TABS.map((section) => {
          const count = sectionSize(config, section.key);

          return (
            <li key={section.key}>
              {section.route === null ? (
                <span
                  aria-disabled='true'
                  title={t('unavailable')}
                  className={cn(CONFIG_TAB_CLASS, 'text-muted-foreground/60')}
                >
                  {t(section.label)}
                  {count !== null && <SectionCount count={count} />}
                </span>
              ) : (
                <Link
                  to={section.route}
                  activeOptions={{ exact: true }}
                  activeProps={{ 'aria-current': 'page' }}
                  className={cn(
                    CONFIG_TAB_CLASS,
                    'group text-muted-foreground transition-colors hover:text-foreground',
                    'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                    'aria-[current=page]:text-foreground'
                  )}
                >
                  {t(section.label)}
                  {count !== null && <SectionCount count={count} />}
                  <span className={cn(CONFIG_TAB_UNDERLINE, 'hidden group-aria-[current=page]:block')} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SectionCount({ count }: { count: number }) {
  return <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>;
}
