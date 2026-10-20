import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDevices } from '@entities/Device';
import { useDeviceRoute } from '@features/Device/DeviceRoute';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { cn } from '@shared/lib/utils';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LiveRegion,
  QueryFailure,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';

import { DevicesRow } from './DevicesRow';
import { DevicesTableHeader } from './DevicesTableHeader';

/** The header row is also a table row: row numbering starts with it. */
const HEADER_ROWS = 1;

/**
 * LAN devices from DHCP leases and static dnsmasq entries. The order is the
 * daemon's, by address: a router has tens of devices, and sorting with filtering
 * would add nothing here.
 *
 * The remaining lease time is counted from the moment of the last list snapshot, not from
 * the current second: the list is polled once a minute, and a more exact value is not needed.
 *
 * The list is not virtualized for the same reason, but it is built with roles anyway: the header
 * must name the columns, not only mark them up with styles.
 */
export function DevicesPage() {
  const { t } = useTranslation('pages/Devices');
  const devices = useDevices();
  const route = useDeviceRoute();
  const [editing, setEditing] = useState<string | null>(null);
  const { message, announce } = useLiveRegion();
  const list = devices.data ?? [];

  const onDone = useCallback(
    (label: string | null) => {
      setEditing(null);

      if (label !== null) {
        announce(t('announce.renamed', { device: label }));
      }
    },
    [announce, t]
  );

  return (
    <>
      <PageHeader title={t('section.devices', { ns: 'shared' })} />

      <LiveRegion message={message} />

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {devices.isPending && <SkeletonRows className={SURFACE} />}

        {devices.isLoadingError && <QueryFailure messageKey='source.devices' query={devices} />}

        {devices.isSuccess && list.length === 0 && (
          <Empty className='border'>
            <EmptyHeader>
              <EmptyTitle>{t('empty.title')}</EmptyTitle>
              <EmptyDescription className='max-w-prose text-pretty'>{t('empty.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {list.length > 0 && (
          <section className={cn('flex min-w-0 flex-col overflow-hidden', SURFACE)}>
            <div role='table' aria-label={t('title')} aria-rowcount={list.length + HEADER_ROWS}>
              <DevicesTableHeader />

              <div role='rowgroup'>
                {list.map((device, position) => (
                  <DevicesRow
                    key={device.mac}
                    device={device}
                    rowIndex={position + 1 + HEADER_ROWS}
                    editing={editing === device.mac}
                    onEdit={setEditing}
                    onDone={onDone}
                    routeModel={route.model}
                    routeLocked={route.locked}
                    routeForeign={route.foreignService}
                    onRoute={route.route}
                    now={devices.dataUpdatedAt}
                  />
                ))}
              </div>
            </div>

            <p role='status' className='border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
              {t('footer.rows', { count: list.length })}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
