import type { ReactNode } from 'react';

import { ConnectionActionCell } from './ConnectionActionCell';
import { ConnectionAgeCell } from './ConnectionAgeCell';
import { ConnectionChainCell } from './ConnectionChainCell';
import { CONNECTION_FIELD, type ConnectionCellProps, type ConnectionField } from './ConnectionColumns';
import { ConnectionHostCell } from './ConnectionHostCell';
import { ConnectionNetworkCell } from './ConnectionNetworkCell';
import { ConnectionRateCell } from './ConnectionRateCell';
import { ConnectionRuleCell } from './ConnectionRuleCell';
import { ConnectionSourceCell } from './ConnectionSourceCell';
import { ConnectionVolumeCell } from './ConnectionVolumeCell';

/**
 * Ячейка по имени колонки: новая колонка добавляется записью здесь и описанием
 * в `ConnectionColumns`, а состав и порядок приходят из состояния таблицы.
 */
export const CELL: Readonly<Record<ConnectionField, (props: ConnectionCellProps) => ReactNode>> = {
  [CONNECTION_FIELD.Source]: ConnectionSourceCell,
  [CONNECTION_FIELD.Host]: ConnectionHostCell,
  [CONNECTION_FIELD.Network]: ConnectionNetworkCell,
  [CONNECTION_FIELD.Rule]: ConnectionRuleCell,
  [CONNECTION_FIELD.Action]: ConnectionActionCell,
  [CONNECTION_FIELD.Chain]: ConnectionChainCell,
  [CONNECTION_FIELD.Rate]: ConnectionRateCell,
  [CONNECTION_FIELD.Volume]: ConnectionVolumeCell,
  [CONNECTION_FIELD.Age]: ConnectionAgeCell,
};
