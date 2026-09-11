export interface ClashConnectionMetadata {
  network: string;
  type: string;
  sourceIP: string;
  sourcePort: string;
  destinationIP: string;
  destinationPort: string;
  host: string;
  dnsMode: string;
  processPath: string;
}

/**
 * `rule` приходит строкой формата sing-box: `inbound=in => route(select)`,
 * а у правила без условий левая часть пуста — ` => route(direct)`.
 * `chains` перечисляет цепочку от узла к группе, то есть в обратном порядке
 * относительно того, как её читает человек.
 */
export interface ClashConnection {
  id: string;
  chains: string[];
  rule: string;
  rulePayload: string;
  upload: number;
  download: number;
  start: string;
  metadata: ClashConnectionMetadata;
}

/**
 * Поток `/connections` отдаёт **полный снапшот** примерно раз в секунду, а не
 * приращения: на 132 соединениях это 60 КБ на сообщение (замер 2026-09-10).
 * Соединения, завершившиеся между снапшотами, просто исчезают из списка —
 * списка закрытых Clash API не отдаёт вовсе.
 */
export interface ClashConnectionsSnapshot {
  connections: ClashConnection[];
  uploadTotal: number;
  downloadTotal: number;
  memory: number;
}
