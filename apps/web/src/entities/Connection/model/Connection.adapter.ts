import { decodeFrame } from '@shared/api';

import { ConnectionsSnapshotSchema, type ConnectionWire } from '../api/Connection.schema';
import { FINAL_OUTCOME, type ConnectionRow } from './Connection.model';

export function toConnectionRow(connection: ConnectionWire): ConnectionRow {
  return {
    id: connection.id,
    host: connection.host,
    network: connection.network,
    source: connection.source,
    rule: connection.rule,
    // Исход по умолчанию показывается узлом конфига, а не пустой строкой:
    // «ни одно правило не совпало» — наблюдаемый факт (ADR-0007).
    outcome: connection.final ? FINAL_OUTCOME : connection.action,
    // Цепочка приходит от узла к группе — человек читает её в обратную сторону.
    chain: [...connection.chain].reverse(),
    upload: connection.upload,
    download: connection.download,
    startedAt: Date.parse(connection.started_at),
  };
}

/**
 * Снапшот потока. `null` — кадр отбракован: следующий придёт через секунду, и
 * ронять на непонятом кадре подписку незачем. Стор считает отбракованные, иначе
 * экран замер бы на старых данных без единого признака поломки.
 */
export function toConnectionsSnapshot(raw: unknown) {
  return decodeFrame(ConnectionsSnapshotSchema, raw, 'connections');
}
