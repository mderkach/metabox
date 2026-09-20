/**
 * Единицы времени. Всё, что переводит одни единицы в другие, берёт коэффициенты
 * отсюда: раньше `1000`, `60` и `24` жили копиями в шести модулях, и каждая
 * копия читалась как самостоятельное решение.
 *
 * Здесь только коэффициенты пересчёта. Пороги и периоды — интервал опроса,
 * таймаут запроса, окно правдоподобной дельты — настройки своих модулей и
 * объявляются там же, но выражаются через эти единицы.
 */
export const MS_IN_SECOND = 1000;
export const SECONDS_IN_MINUTE = 60;
export const MINUTES_IN_HOUR = 60;
export const HOURS_IN_DAY = 24;
export const DAYS_IN_WEEK = 7;

export const SECONDS_IN_HOUR = SECONDS_IN_MINUTE * MINUTES_IN_HOUR;

export const MS_IN_MINUTE = MS_IN_SECOND * SECONDS_IN_MINUTE;
export const MS_IN_HOUR = MS_IN_MINUTE * MINUTES_IN_HOUR;
export const MS_IN_DAY = MS_IN_HOUR * HOURS_IN_DAY;
export const MS_IN_WEEK = MS_IN_DAY * DAYS_IN_WEEK;

/** Go отдаёт `time.Duration` наносекундами; в панели секунды. */
export const NS_IN_SECOND = 1_000_000_000;
export const US_IN_SECOND = 1_000_000;
