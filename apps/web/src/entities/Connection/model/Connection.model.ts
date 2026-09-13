export interface ConnectionRow {
  id: string;
  /** Хост с портом; когда sniff не разобрал имя, остаётся адрес. */
  host: string;
  network: string;
  source: string;
  /** Условия сработавшего правила: у безусловного правила пусто. */
  rule: string;
  /** Исход правила: `route(proxy)`, `hijack-dns`, `sniff`. */
  outcome: string;
  /** Цепочка в порядке чтения человеком: группа → узел. */
  chain: string[];
  upload: number;
  download: number;
  /**
   * Скорость за последний интервал снапшотов, байт в секунду. Считает панель:
   * рантайм отдаёт только накопленные счётчики, а вопрос «кто сейчас ест канал»
   * по ним не отвечается.
   */
  downRate: number;
  upRate: number;
  startedAt: number;
  /** Хост, источник, правило, исход и цепочка одной строкой — по ней ищет экран. */
  searchText: string;
}

/** Байт в секунду за интервал между двумя снапшотами. */
export interface ConnectionRate {
  down: number;
  up: number;
}

export interface ConnectionTotals {
  upload: number;
  download: number;
  memory: number;
}

/** Исход соединения, не совпавшего ни с одним правилом: узел `route.final`. */
export const FINAL_OUTCOME = 'route.final';

/** Сколько закрытых соединений держим: список закрытых Clash API не отдаёт. */
export const CLOSED_LIMIT = 200;
