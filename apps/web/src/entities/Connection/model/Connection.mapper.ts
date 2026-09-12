import type { ConnectionDto } from '../api/Connection.dto';
import { FINAL_OUTCOME, type ConnectionRow } from './Connection.model';

export function toConnectionRow(connection: ConnectionDto): ConnectionRow {
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
