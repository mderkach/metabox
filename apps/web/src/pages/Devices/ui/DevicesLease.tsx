import { Trans, useTranslation } from 'react-i18next';

import { leaseLeft, type Device } from '@entities/Device';
import { formatAge, formatDateTime } from '@shared/lib/format';
import { Badge } from '@shared/ui';

/** Lease kind in LuCI wording and the remaining time of a dynamic one, counted from `now`. */
export function DevicesLease({ device, now }: { device: Device; now: number }) {
  const { t } = useTranslation('pages/Devices');
  const left = leaseLeft(device, now);

  return (
    <>
      <Badge
        variant={device.static ? 'secondary' : 'outline'}
        title={device.static ? t('lease.staticHint') : t('lease.dynamicHint')}
      >
        {device.static ? t('lease.static') : t('lease.dynamic')}
      </Badge>
      {left !== null && device.leaseExpires !== null && (
        <span className='text-xs text-muted-foreground'>
          <Trans
            t={t}
            i18nKey='lease.left'
            values={{ left: formatAge(left) }}
            components={{
              time: <time dateTime={device.leaseExpires.toISOString()} title={formatDateTime(device.leaseExpires)} />,
            }}
          />
        </span>
      )}
    </>
  );
}
