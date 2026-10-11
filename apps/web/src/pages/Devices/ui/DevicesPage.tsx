import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDevices } from '@entities/Device';
import { DeviceRouteBar, useDeviceRoute } from '@features/Device/DeviceRoute';
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

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/**
 * Устройства LAN из аренд DHCP и статических записей dnsmasq. Порядок — как у
 * демона, по адресу: устройств на роутере десятки, и сортировка с отбором
 * здесь ничего не дают.
 *
 * Список не виртуализован по той же причине, а ролями собран всё равно: шапка
 * обязана называть колонки, а не только размечать их стилями.
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
        <DeviceRouteBar transaction={route.transaction} isConfirming={route.isConfirming} onConfirm={route.confirm} />

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
