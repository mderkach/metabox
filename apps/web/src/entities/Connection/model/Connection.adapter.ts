import { decodeFrame } from '@shared/api';

import { ConnectionsSnapshotSchema, type ConnectionWire } from '../api/Connection.schema';
import { FINAL_ACTION, type ConnectionRate, type ConnectionRow } from './Connection.model';

/** Скорости приходят извне: считать их можно только рядом с прошлым снапшотом. */
export function toConnectionRow(connection: ConnectionWire, rate: ConnectionRate): ConnectionRow {
  const action = connection.final ? FINAL_ACTION : connection.action;
  const chain = [...connection.chain].reverse();

  return {
    id: connection.id,
    host: connection.host,
    network: connection.network,
    source: connection.source,
    rule: connection.rule,
    // Исход по умолчанию показывается узлом конфига, а не пустой строкой:
    // «ни одно правило не совпало» — наблюдаемый факт (ADR-0007).
    action,
    // Цепочка приходит от узла к группе — человек читает её в обратную сторону.
    chain,
    upload: connection.upload,
    download: connection.download,
    downRate: rate.down,
    upRate: rate.up,
    startedAt: Date.parse(connection.started_at),
    searchText: [connection.host, connection.source, connection.network, connection.rule, action, ...chain]
      .join(' ')
      .toLowerCase(),
  };
}

/** `null` — снапшот отбракован; счёт отбракованных ведёт стор. */
export function toConnectionsSnapshot(raw: unknown) {
  return decodeFrame(ConnectionsSnapshotSchema, raw, 'connections');
}
