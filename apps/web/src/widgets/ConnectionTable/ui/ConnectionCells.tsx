import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { formatAge, formatBytes, formatRate } from '@shared/lib/format';
import { MS_IN_SECOND } from '@shared/lib/time';
import { cn } from '@shared/lib/utils';

import { toActionTone } from './ConnectionAction';
import { CONNECTION_FIELD, type ConnectionField } from './ConnectionColumns';

/** Нулевая скорость — не «0 Б/с», а прочерк: молчащих строк большинство. */
const IDLE_RATE = 1;

export interface CellProps {
  connection: ConnectionRowModel;
  /** Момент отсчёта давности. Снаружи, иначе строка врала бы про свежесть. */
  now: number;
}

/**
 * Ячейка по имени колонки: новая колонка добавляется записью здесь и описанием
 * в `ConnectionColumns`, а состав и порядок приходят из состояния таблицы.
 */
export const CELL: Readonly<Record<ConnectionField, (props: CellProps) => ReactNode>> = {
  [CONNECTION_FIELD.Source]: SourceCell,
  [CONNECTION_FIELD.Host]: HostCell,
  [CONNECTION_FIELD.Network]: NetworkCell,
  [CONNECTION_FIELD.Rule]: RuleCell,
  [CONNECTION_FIELD.Action]: ActionCell,
  [CONNECTION_FIELD.Chain]: ChainCell,
  [CONNECTION_FIELD.Rate]: RateCell,
  [CONNECTION_FIELD.Volume]: VolumeCell,
  [CONNECTION_FIELD.Age]: AgeCell,
};

function SourceCell({ connection }: CellProps) {
  return (
    <span className='block truncate font-mono text-xs text-muted-foreground' title={connection.source}>
      {connection.source}
    </span>
  );
}

function HostCell({ connection }: CellProps) {
  return (
    <span className='block truncate font-mono text-xs' title={connection.host}>
      {connection.host}
    </span>
  );
}

function NetworkCell({ connection }: CellProps) {
  return <span className='font-mono text-2xs text-muted-foreground'>{connection.network}</span>;
}

function RuleCell({ connection }: CellProps) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const rule = connection.rule.length > 0 ? connection.rule : t('row.unconditional');

  return (
    <span className='block truncate font-mono text-xs' title={rule}>
      {rule}
    </span>
  );
}

function ActionCell({ connection }: CellProps) {
  return (
    <span
      className={cn('block truncate font-mono text-xs font-medium', toActionTone(connection.action))}
      title={connection.action}
    >
      {connection.action}
    </span>
  );
}

function ChainCell({ connection }: CellProps) {
  const chain = connection.chain.join(' → ');

  return (
    <span className='block truncate text-2xs text-muted-foreground' title={chain}>
      {chain}
    </span>
  );
}

function RateCell({ connection }: CellProps) {
  return (
    <span className='grid gap-y-0.5 font-mono text-2xs'>
      <span
        className={cn('tabular-nums', connection.downRate >= IDLE_RATE ? 'text-series-down' : 'text-muted-foreground')}
      >
        ↓ {connection.downRate >= IDLE_RATE ? formatRate(connection.downRate) : '—'}
      </span>
      <span className={cn('tabular-nums', connection.upRate >= IDLE_RATE ? 'text-series-up' : 'text-muted-foreground')}>
        ↑ {connection.upRate >= IDLE_RATE ? formatRate(connection.upRate) : '—'}
      </span>
    </span>
  );
}

function VolumeCell({ connection }: CellProps) {
  return (
    <span className='grid gap-y-0.5 font-mono text-2xs text-muted-foreground tabular-nums'>
      <span>↓ {formatBytes(connection.download)}</span>
      <span>↑ {formatBytes(connection.upload)}</span>
    </span>
  );
}

function AgeCell({ connection, now }: CellProps) {
  return (
    <time
      dateTime={new Date(connection.startedAt).toISOString()}
      className='font-mono text-2xs text-muted-foreground tabular-nums'
    >
      {formatAge((now - connection.startedAt) / MS_IN_SECOND)}
    </time>
  );
}
