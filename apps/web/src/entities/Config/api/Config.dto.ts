/** Запись истории конфига — `config.Version` демона. */
export interface ConfigVersionDto {
  /** Монотонный номер. Порядок задаётся им, а не временем: у роутера нет RTC. */
  id: number;
  size: number;
  sum: string;
  /** Секунды Unix по часам устройства. Ноль — часы не синхронизованы. */
  saved_at: number;
}

/** Ответ `GET /api/config/versions`. */
export interface ConfigVersionsDto {
  versions: ConfigVersionDto[];
}

/**
 * Вывод `sing-box check` в отказе `check_failed` — единственная внутренняя
 * подробность, которую демон отдаёт наружу (ADR-0002): на этих строках
 * пользователь чинит конфиг.
 */
export interface CheckDetailsDto {
  stdout: string;
  stderr: string;
  exit_code: number;
}
