import type { ParseKeys } from 'i18next';

import { SERVICE_STATUS, type ServiceStatus } from '@entities/Daemon';

export const SERVICE_TONE: Readonly<Record<ServiceStatus, string>> = {
  [SERVICE_STATUS.Running]: 'bg-signal-ok',
  [SERVICE_STATUS.Stopped]: 'bg-signal-idle',
  [SERVICE_STATUS.Failed]: 'bg-signal-bad',
};

export const SERVICE_LABEL = {
  [SERVICE_STATUS.Running]: 'service.running',
  [SERVICE_STATUS.Stopped]: 'service.stopped',
  [SERVICE_STATUS.Failed]: 'service.failed',
} as const satisfies Readonly<Record<ServiceStatus, ParseKeys<'widgets/AppSidebar'>>>;
