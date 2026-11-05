import { useTranslation } from 'react-i18next';

import { type ServiceStatus } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';

import { SERVICE_LABEL, SERVICE_TONE } from './AppSidebarService';

export function AppSidebarServiceDot({ status, collapsed }: { status: ServiceStatus | null; collapsed: boolean }) {
  const { t } = useTranslation('widgets/AppSidebar');
  const label = t(status === null ? 'service.unknown' : SERVICE_LABEL[status]);
  const tone = status === null ? 'bg-signal-idle' : SERVICE_TONE[status];

  return (
    <p title={label} className='flex items-center gap-2 text-xs text-muted-foreground'>
      <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', tone)} />
      {!collapsed && <span className='truncate'>{label}</span>}
      {collapsed && <span className='sr-only'>{label}</span>}
    </p>
  );
}
