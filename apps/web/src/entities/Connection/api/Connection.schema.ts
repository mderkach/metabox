import { z } from 'zod';

/**
 * Соединение в контракте демона (ADR-0006): форма не зависит от того, каким
 * источником оно прочитано. Условия правила и его исход демон разводит сам —
 * склеенной строки Clash API панель не видит.
 */
export const ConnectionSchema = z.object({
  id: z.string(),
  /** Адрес назначения с портом: имя из sniff, иначе адрес. */
  host: z.string(),
  network: z.string(),
  source: z.string(),
  /** Условия сработавшего правила; пусто у правила без условий и у `route.final`. */
  rule: z.string(),
  /** Исход правила; пусто, когда источник его не отдаёт. */
  action: z.string(),
  /**
   * Ни одно правило не совпало — сработал `route.final`. Отдельный признак
   * нужен потому, что у этого исхода условия пусты так же, как у правила без
   * условий, а это разные вещи (ADR-0007).
   */
  final: z.boolean(),
  /** Цепочка в порядке core: от конечного узла к группе. */
  chain: z.array(z.string()),
  upload: z.number(),
  download: z.number(),
  /** Время начала в том виде, в каком его отдал core. */
  started_at: z.string(),
});

/**
 * Топик `connections` отдаёт **полный снапшот** примерно раз в секунду, а не
 * приращения: на 132 соединениях это 60 КБ на сообщение (замер 2026-09-10).
 * Соединения, завершившиеся между снапшотами, просто исчезают из списка —
 * списка закрытых ни один источник не отдаёт.
 */
export const ConnectionsSnapshotSchema = z.object({
  connections: z.array(ConnectionSchema),
  upload_total: z.number(),
  download_total: z.number(),
  memory: z.number(),
});

export type ConnectionWire = z.infer<typeof ConnectionSchema>;
export type ConnectionsSnapshotWire = z.infer<typeof ConnectionsSnapshotSchema>;
