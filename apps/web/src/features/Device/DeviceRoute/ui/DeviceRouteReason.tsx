import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ROUTE_REASON, type RouteReason } from '@entities/Dataplane';

type Namespace = 'features/Device/DeviceRoute';

/** Причина коротко — в строке, полностью — в подсказке и описании тумблера. */
const REASON_KEY: Readonly<Record<RouteReason['kind'], { short: ParseKeys<Namespace>; full: ParseKeys<Namespace> }>> = {
  [ROUTE_REASON.Mac]: { short: 'reason.mac', full: 'reason.macFull' },
  [ROUTE_REASON.Host]: { short: 'reason.host', full: 'reason.hostFull' },
  [ROUTE_REASON.Subnet]: { short: 'reason.subnet', full: 'reason.subnetFull' },
};

export function DeviceRouteReason({ id, reason }: { id: string; reason: RouteReason }) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const values = { subnet: reason.kind === ROUTE_REASON.Subnet ? reason.subnet : '' };
  const full = t(REASON_KEY[reason.kind].full, values);

  return (
    <span id={id} title={full} className='min-w-0 text-xs text-muted-foreground'>
      <span aria-hidden='true'>{t(REASON_KEY[reason.kind].short, values)}</span>
      <span className='sr-only'>{full}</span>
    </span>
  );
}
