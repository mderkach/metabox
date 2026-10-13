import { Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SCHEMA_DRIFT, schemaDrift, useServiceState } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';

/**
 * A mark about sing-box diverging from the form schema. Sits in the footer, not only in the
 * config section: the divergence must be visible from any screen, and
 * the details are where the forms are edited.
 */
export function AppSidebarDrift({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const service = useServiceState();
  const drift = schemaDrift(service.data?.binary);

  if (drift === SCHEMA_DRIFT.None) {
    return null;
  }

  const text = t(`drift.${drift}`);
  const Icon = drift === SCHEMA_DRIFT.Older ? TriangleAlert : Info;

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs',
        drift === SCHEMA_DRIFT.Older ? 'text-signal-warn' : 'text-muted-foreground',
        collapsed && 'justify-center'
      )}
    >
      <Icon className='size-3.5 shrink-0' aria-hidden={!collapsed} aria-label={collapsed ? text : undefined} />
      {!collapsed && <span>{text}</span>}
    </p>
  );
}
