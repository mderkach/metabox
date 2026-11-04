import { PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

const LOGO_CLASS =
  'flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground';

export function AppSidebarLogo({ expand }: { expand?: () => void }) {
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
