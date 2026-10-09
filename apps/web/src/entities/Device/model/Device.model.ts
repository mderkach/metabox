import { NAME_SOURCE } from '../api/Device.schema';

export { NAME_SOURCE };

export type NameSource = (typeof NAME_SOURCE)[number];

export interface Device {
  /** Пусто, когда адреса нет ни в аренде, ни в статической записи: у устройства есть только своё имя. */
  ip: string;
  /** Нижний регистр через двоеточие: по нему демон хранит своё имя. */
  mac: string;
  /** Подпись по приоритету демона; пусто, когда имени нет ни в одном источнике. */
  name: string;
  /** Откуда взята подпись. Строка, а не `NameSource`: значение, которого панель не знает, показывается как пришло. */
  nameSource: string;
  static: boolean;
  online: boolean;
  /** Конец аренды; `null` — аренды нет или она бессрочная. */
  leaseExpires: Date | null;
  /** Как устройство подписано в панели — см. `toDeviceLabel`. */
  label: string;
}

/** Устройства по адресу: так источник соединения находит свою подпись. */
export type DeviceIndex = ReadonlyMap<string, Device>;

export const EMPTY_DEVICE_INDEX: DeviceIndex = new Map();

export function isNameSource(value: string): value is NameSource {
  return NAME_SOURCE.some((source) => source === value);
}

/**
 * Подпись устройства. Приоритет «своё имя → статическая аренда → DHCP» считает
 * демон и отдаёт победителя в `name`; панель добавляет только запасные ступени:
 * адрес, а у устройства без адреса — MAC.
 */
export function toDeviceLabel(device: Pick<Device, 'ip' | 'mac' | 'name'>): string {
  if (device.name !== '') {
    return device.name;
  }

  return device.ip === '' ? device.mac : device.ip;
}

/**
 * Подпись источника соединения — единственная точка перевода адреса в имя;
 * места, где она стоит, перечислены тестом `Device.places`. Незнакомый адрес
 * остаётся адресом.
 */
export function deviceLabel(ip: string, devices: DeviceIndex): string {
  return devices.get(ip)?.label ?? ip;
}
