import { sortFn_alphanumeric, sortFn_basic, sortFn_text } from '@tanstack/react-table';
import { beforeAll, describe, expect, it } from 'vitest';

import { ConnectionStore, type ConnectionRow } from '@entities/Connection';
import { makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';

import { CONNECTION_COLUMNS, CONNECTION_FIELD } from '../ui/ConnectionColumns';

/** Потолок NFR-2: столько соединений панель обязана держать. */
const SNAPSHOT_SIZE = 5000;
const RUNS = 5;

/**
 * Замер 2026-09-18 в браузере на живых моках: снапшот раз в секунду, нажатие на
 * колонку — 33–46 мс до перерисовки, длинных задач ноль.
 *
 * Тест меряет не модель строк библиотеки, а её основную стоимость: съём ключа
 * через `accessorFn` описания колонки и упорядочивание пяти тысяч значений.
 * Ключи снимаются те же, что в работе, поэтому дорогой `accessorFn` тест
 * поймает; накладные расходы самой библиотеки — нет.
 *
 * Порог с запасом в разы: файлы тестов идут параллельно, и под нагрузкой
 * соседей замер плывёт. Тест ловит подорожание в разы, а не микрорегрессию.
 */
const SORT_BUDGET_MS = 60;

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

/** Ключи снимаются тем же `accessorFn`, что и в работе. */
function sortBy(field: string, rows: readonly ConnectionRow[]): number {
  const def = CONNECTION_COLUMNS.find((column) => column.id === field);

  if (def === undefined) {
    throw new Error(`Колонки ${field} нет в описании таблицы`);
  }

  const keyed = rows.map((row, index) => def.accessorFn(row, index));
  const start = performance.now();

  keyed.sort((left, right) =>
    typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
  );

  return performance.now() - start;
}

describe('бюджет таблицы соединений', () => {
  let rows: readonly ConnectionRow[] = [];

  beforeAll(() => {
    ConnectionStore.getState().reset();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(SNAPSHOT_SIZE));
    rows = ConnectionStore.getState().active;
  });

  it('сортирует 5000 строк по числовой колонке в пределах бюджета', () => {
    const runs = Array.from({ length: RUNS }, () => sortBy(CONNECTION_FIELD.Volume, rows));

    expect(median(runs)).toBeLessThan(SORT_BUDGET_MS);
  });

  it('сортирует 5000 строк по текстовой колонке в пределах бюджета', () => {
    const runs = Array.from({ length: RUNS }, () => sortBy(CONNECTION_FIELD.Host, rows));

    expect(median(runs)).toBeLessThan(SORT_BUDGET_MS);
  });

  it('объявляет сравнение для каждой колонки: без него список молча идёт в порядке потока', () => {
    const registered = { text: sortFn_text, basic: sortFn_basic, alphanumeric: sortFn_alphanumeric };

    for (const def of CONNECTION_COLUMNS) {
      expect(typeof def.sortFn).toBe('string');
      expect(registered).toHaveProperty(String(def.sortFn));
    }
  });
});
