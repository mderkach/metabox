import { useTranslation } from 'react-i18next';

import { LATENCY_LEVEL, type toLatencyReading } from '@entities/Proxy';
import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';

import { PROXY_GROUPS_NS } from '../i18n/ProxyGroups.namespace.generated';
import type { ProxyNodeDiagnosticInfo } from './ProxyNodeDiagnostic';

export function ProxyNodeStatus({
  reading,
  diagnostic,
  runtimeFailure,
}: {
  reading: ReturnType<typeof toLatencyReading>;
  diagnostic: ProxyNodeDiagnosticInfo['status'];
  runtimeFailure: boolean;
}) {
  const { t } = useTranslation(PROXY_GROUPS_NS);
  let label: string | undefined = diagnostic?.label;
  let tone = diagnostic?.failed === true ? 'text-signal-bad' : 'text-muted-foreground';

  if (diagnostic === undefined) {
    switch (runtimeFailure ? LATENCY_LEVEL.NoAnswer : reading.level) {
      case LATENCY_LEVEL.NoAnswer:
        label = t('delay.timedOut', { ns: SHARED_NS });
        tone = 'text-signal-bad';
        break;
      case LATENCY_LEVEL.AboveNorm:
        label = t('metadata.aboveNorm');
        tone = 'text-signal-warn';
        break;
      case LATENCY_LEVEL.AboveCeiling:
        label = t('metadata.aboveCeiling');
        tone = 'text-signal-warn';
        break;
      case LATENCY_LEVEL.WithinNorm:
        label = t('metadata.withinNorm');
        tone = 'text-signal-ok';
        break;
      case LATENCY_LEVEL.NoMeasurement:
      case undefined:
        label = t('delay.noMeasurement', { ns: SHARED_NS });
    }
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs', tone)}>
      <span aria-hidden='true' className='size-1.5 shrink-0 rounded-full bg-current' />
      <span className='wrap-anywhere'>{label}</span>
    </span>
  );
}
