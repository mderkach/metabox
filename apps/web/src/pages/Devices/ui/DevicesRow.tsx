import { Link } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import { Pencil } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataplaneModel, RouteSource } from '@entities/Dataplane';
import { isNameSource, type Device, type NameSource } from '@entities/Device';
import { DeviceRenameForm } from '@features/Device/DeviceRename';
import { DeviceRouteSwitch } from '@features/Device/DeviceRoute';
import { cn } from '@shared/lib/utils';
import { Badge, Button, buttonVariants } from '@shared/ui';

import { DEVICES_COLUMN } from './DevicesColumns';

/** Таблица обязана покрывать набор демона: новый источник — ошибка компиляции здесь. */
const NAME_SOURCE_KEY: Readonly<Record<NameSource, ParseKeys<'pages/Devices'>>> = {
  custom: 'nameSource.custom',
  static: 'nameSource.static',
  dhcp: 'nameSource.dhcp',
  none: 'nameSource.none',
};

/**
 * Строка устройства. Подпись — первое, что читается: ею устройство названо по
 * всей панели. Переименование открывается в той же ячейке, а не в панели:
 * правится одно поле, и уводить взгляд от строки незачем.
 */
function DevicesRowProto({
  device,
  rowIndex,
  editing,
  onEdit,
  onDone,
  routeModel,
  routeLocked,
  onRoute,
}: {
  device: Device;
  rowIndex: number;
  editing: boolean;
  onEdit: (mac: string) => void;
  /** Правка закрылась: `label` — новая подпись или `null`, если её отменили. */
  onDone: (label: string | null) => void;
  /** Модель обвязки; `null` — не прочитана, и тумблер недоступен. */
  routeModel: DataplaneModel | null;
  routeLocked: boolean;
  onRoute: (source: RouteSource, routed: boolean) => void;
}) {
  const { t } = useTranslation('pages/Devices');

  return (
    <div role='row' aria-rowindex={rowIndex} className={DEVICES_COLUMN.Row}>
      <span role='cell' className={DEVICES_COLUMN.Label}>
        {editing ? (
          <DeviceRenameForm device={device} onDone={onDone} />
        ) : (
          <>
            <span className={cn('min-w-0 truncate text-sm', device.label === device.ip && 'font-mono')}>
              {device.label}
            </span>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('row.rename', { device: device.label })}
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

      <span role='cell' className={DEVICES_COLUMN.NameSource}>
        {isNameSource(device.nameSource) ? t(NAME_SOURCE_KEY[device.nameSource]) : device.nameSource}
      </span>

      <span role='cell' className={DEVICES_COLUMN.Lease}>
        <Badge variant={device.static ? 'secondary' : 'outline'}>
          {device.static ? t('lease.static') : t('lease.dynamic')}
        </Badge>
      </span>

      <span role='cell' className={DEVICES_COLUMN.Online}>
        <span className={cn('flex items-center gap-1.5', device.online ? 'text-signal-ok' : 'text-muted-foreground')}>
          <span aria-hidden='true' className='size-2 rounded-full bg-current' />
          {device.online ? t('online.yes') : t('online.no')}
        </span>
      </span>

      <span role='cell' className={DEVICES_COLUMN.Route}>
        <DeviceRouteSwitch
          source={device}
          label={device.label}
          model={routeModel}
          locked={routeLocked}
          onRoute={onRoute}
        />
      </span>

      <span role='cell' className={DEVICES_COLUMN.RowActions}>
        {device.ip !== '' && (
          <Link
            to='/connections'
            search={{ source: device.ip }}
            aria-label={t('row.connectionsOf', { device: device.label })}
            // Покрашена кнопкой, но остаётся ссылкой: `Button` с `render` ставит
            // `role="button"` поверх `<a href>`.
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
