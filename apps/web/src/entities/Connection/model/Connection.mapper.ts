import type { ClashConnection } from '../api/Connection.dto';
import type { ConnectionRow } from './Connection.model';

/** Разделитель условий и исхода в строке правила sing-box. */
const RULE_SEPARATOR = ' => ';

/**
 * `rule` приходит одной строкой: `rule_set=github => route(proxy)`, а у
 * правила без условий левая часть пуста. Разбор нужен, чтобы условие и исход
 * стояли в разных колонках и фильтровались по отдельности.
 */
export function splitRule(rule: string): Pick<ConnectionRow, 'rule' | 'outcome'> {
  const at = rule.indexOf(RULE_SEPARATOR);

  if (at < 0) {
    return { rule: '', outcome: rule.trim() };
  }

  return { rule: rule.slice(0, at).trim(), outcome: rule.slice(at + RULE_SEPARATOR.length).trim() };
}

export function toConnectionRow(connection: ClashConnection): ConnectionRow {
  const { metadata } = connection;
  const host = metadata.host.length > 0 ? metadata.host : metadata.destinationIP;

  return {
    id: connection.id,
    host: `${host}:${metadata.destinationPort}`,
    network: metadata.network,
    source: metadata.sourceIP,
    // Цепочка приходит от узла к группе — человек читает её в обратную сторону.
    chain: [...connection.chains].reverse(),
    upload: connection.upload,
    download: connection.download,
    startedAt: Date.parse(connection.start),
    ...splitRule(connection.rule),
  };
}
