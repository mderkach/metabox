const BYTE_UNITS = ['Б', 'кБ', 'МБ', 'ГБ', 'ТБ'] as const;
const BYTE_STEP = 1024;

/** Байты человеку: рантайм отдаёт их числом, а колонки узкие. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;

  while (value >= BYTE_STEP && unit < BYTE_UNITS.length - 1) {
    value /= BYTE_STEP;
    unit += 1;
  }

  return `${unit === 0 ? String(Math.round(value)) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/** Скорость за секунду: та же шкала, другая подпись. */
export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/с`;
}

/** Границы русской плюрализации: 11–14 всегда «много», дальше решает последняя цифра. */
const TEEN_FROM = 11;
const TEEN_TO = 14;
const FEW_FROM = 2;
const FEW_TO = 4;
const DECIMAL = 10;
const HUNDRED = 100;

/**
 * Русское числительное: `plural(2, ['узел', 'узла', 'узлов'])` → «2 узла».
 * Библиотеки локализации в проекте нет намеренно — язык один (`shared/lib/i18n`).
 */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const tail = count % HUNDRED;
  const last = count % DECIMAL;

  if (tail >= TEEN_FROM && tail <= TEEN_TO) {
    return `${String(count)} ${forms[2]}`;
  }

  if (last === 1) {
    return `${String(count)} ${forms[0]}`;
  }

  return last >= FEW_FROM && last <= FEW_TO ? `${String(count)} ${forms[1]}` : `${String(count)} ${forms[2]}`;
}
