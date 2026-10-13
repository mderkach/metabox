import { Link } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import { Pencil } from 'lucide-react';
import { memo, useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataplaneModel, RouteSource } from '@entities/Dataplane';
import { isNameSource, type Device, type NameSource } from '@entities/Device';
import { DeviceRenameForm } from '@features/Device/DeviceRename';
import { DeviceRouteSwitch } from '@features/Device/DeviceRoute';
import { cn } from '@shared/lib/utils';
import { Button, buttonVariants } from '@shared/ui';

import { DEVICES_COLUMN } from './DevicesColumns';
import { DevicesLease } from './DevicesLease';

/**
 * The table must cover the daemon's set: a new source is a compile error
 * here. `none` needs no explanation: there is no name, and the row is labelled by address.
 */
const NAME_SOURCE_KEY: Readonly<Record<NameSource, ParseKeys<'pages/Devices'> | null>> = {
  custom: 'nameSource.custom',
  static: 'nameSource.static',
  dhcp: 'nameSource.dhcp',
  none: null,
};

/**
 * Device row. The label is the first thing read: it names the device across
 * the whole panel. Renaming opens in the same cell, not in a side panel:
 * one field is edited, and there is no reason to pull the eye away from the row.
 */
function DevicesRowProto({
  device,
  rowIndex,
  editing,
  onEdit,
  onDone,
  routeModel,
  routeLocked,
  routeForeign,
  onRoute,
  now,
}: {
  device: Device;
  rowIndex: number;
  editing: boolean;
  onEdit: (mac: string) => void;
  /** Editing closed: `label` is the new label or `null` if it was cancelled. */
  onDone: (label: string | null) => void;
  /** Dataplane model; `null` means not read, and the toggle is unavailable. */
  routeModel: DataplaneModel | null;
  routeLocked: boolean;
  routeForeign: boolean;
  onRoute: (source: RouteSource, routed: boolean) => void;
  /** Moment of the list snapshot in milliseconds: the remaining lease time is counted from it. */
  now: number;
}) {
  const { t } = useTranslation('pages/Devices');
  const sourceId = useId();
  const sourceKey = isNameSource(device.nameSource) ? NAME_SOURCE_KEY[device.nameSource] : null;
  const sourceText = sourceKey === null ? undefined : t(sourceKey);

  return (
    <div role='row' aria-rowindex={rowIndex} className={DEVICES_COLUMN.Row}>
      <span role='cell' className={DEVICES_COLUMN.Label}>
        {editing ? (
          <DeviceRenameForm device={device} onDone={onDone} />
        ) : (
          <>
            {/* On a wide screen the name source is in a tooltip; a
                phone has no tooltips, so it goes on a second line. */}
            <span className='flex min-w-0 flex-col'>
              <span
                title={sourceText}
                className={cn('min-w-0 truncate text-sm', device.label === device.ip && 'font-mono')}
              >
                {device.label}
              </span>
              {sourceText !== undefined && (
                <span id={sourceId} className='truncate text-xs text-muted-foreground md:sr-only'>
                  {sourceText}
                </span>
              )}
            </span>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('row.rename', { device: device.label })}
              aria-describedby={sourceText === undefined ? undefined : sourceId}
              onClick={() => {
                onEdit(device.mac);
              }}
            >
              <Pencil />
            </Button>
          </>
        )}
      </span>

      <span role='cell' className={DEVICES_COLUMN.Ip}>
        {device.ip === '' ? t('row.noIp') : device.ip}
      </span>

      <span role='cell' className={DEVICES_COLUMN.Mac}>
        {device.mac}
      </span>

      <span role='cell' className={DEVICES_COLUMN.Lease}>
        <span aria-hidden='true' className={DEVICES_COLUMN.CardLabel}>
          {t('column.lease')}
        </span>
        <DevicesLease device={device} now={now} />
      </span>

      <span role='cell' className={DEVICES_COLUMN.Online}>
        <span className={cn('flex items-center gap-1.5', device.online ? 'text-signal-ok' : 'text-muted-foreground')}>
          <span aria-hidden='true' className='size-2 rounded-full bg-current' />
          {device.online ? t('online.yes') : t('online.no')}
        </span>
      </span>

      <span role='cell' className={DEVICES_COLUMN.Route}>
        <span aria-hidden='true' className={DEVICES_COLUMN.CardLabel}>
          {t('column.route')}
        </span>
        <DeviceRouteSwitch
          source={device}
          label={device.label}
          model={routeModel}
          locked={routeLocked}
          foreignService={routeForeign}
          onRoute={onRoute}
        />
      </span>

      <span role='cell' className={DEVICES_COLUMN.RowActions}>
        {device.ip !== '' && (
          <Link
            to='/connections'
            search={{ source: device.ip }}
            aria-label={t('row.connectionsOf', { device: device.label })}
            // Styled as a button but stays a link: `Button` with `render` puts
            // `role="button"` on top of `<a href>`.
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            {t('row.connections')}
          </Link>
        )}
      </span>
    </div>
  );
}

export const DevicesRow = memo(DevicesRowProto);
