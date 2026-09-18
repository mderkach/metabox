import { sortFn_alphanumeric, sortFn_basic, sortFn_text } from '@tanstack/react-table';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ConnectionStore, type ConnectionRow } from '@entities/Connection';
import { advanceConnectionsSnapshot, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';

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

/**
 * Разбор снапшота с оборотом соединений: счётчики выросли, часть строк
 * пересобирается, часть ушла в закрытые.
 *
 * Замер 2026-09-18 в браузере на живых кадрах: 3 мс без замедления, 8.6 мс при
 * замедлении процессора вчетверо. До снятия черновика immer со сторов было
 * 14.9 и 61.3 мс — почти весь бюджет тика уходил на обёртки прокси
 * ([ADR-0024](../../../../../../docs/adr/ADR-0024-drop-the-immer-draft-from-frontend-stores.md)).
 *
 * В этом окружении разбор идёт 3.8 мс. Порог держится ниже того, до чего довела
 * бы обёртка: пересчёт замеров из браузера даёт около 19 мс, и с порогом в
 * десятки миллисекунд её возврат прошёл бы незамеченным.
 *
 * Прогонов больше, чем у сортировки: первый после сброса дороже остальных —
 * индекс пуст, и ни одна из пяти тысяч строк не отдаётся прежним объектом.
 * Короткая выборка из-за этого целиком уезжает вверх, когда соседние файлы
 * тестов отбирают процессор.
 */
const APPLY_BUDGET_MS = 12;
const APPLY_RUNS = 9;

/** Шаг потока: с ним разбор считает скорости, без него — пропускает их вовсе. */
const STREAM_STEP_MS = 500;

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

/**
 * Лучший из прогонов. Медиана здесь плывёт: файлы тестов идут параллельно, и
 * соседи отбирают процессор в произвольный момент, а шум замер только замедляет
 * — значит нижняя граница и есть собственная стоимость разбора.
 */
function fastest(values: number[]): number {
  return Math.min(...values);
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
    // Копия, а не ссылка: замер разбора ниже чистит стор, и сортировка осталась
    // бы без строк.
    rows = [...ConnectionStore.getState().active];
  });

  it('сортирует 5000 строк по числовой колонке в пределах бюджета', () => {
    const runs = Array.from({ length: RUNS }, () => sortBy(CONNECTION_FIELD.Volume, rows));

    expect(median(runs)).toBeLessThan(SORT_BUDGET_MS);
  });

  it('сортирует 5000 строк по текстовой колонке в пределах бюджета', () => {
    const runs = Array.from({ length: RUNS }, () => sortBy(CONNECTION_FIELD.Host, rows));

    expect(median(runs)).toBeLessThan(SORT_BUDGET_MS);
  });

  it('разбирает снапшот на 5000 соединений в пределах бюджета', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    // Часы сдвигаются на шаг потока: подряд идущие вызовы разбор считает
    // неправдоподобно частыми и скорости не считает, а это основная работа.
    let clock = Date.now();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);

    ConnectionStore.getState().reset();

    const runs = Array.from({ length: APPLY_RUNS }, (_, run) => {
      const frame = advanceConnectionsSnapshot(snapshot, run + 1);

      clock += STREAM_STEP_MS;

      const start = performance.now();

      ConnectionStore.getState().apply(frame);

      return performance.now() - start;
    });

    now.mockRestore();

    const state = ConnectionStore.getState();

    expect(state.active).toHaveLength(SNAPSHOT_SIZE);
    // Оборот соединений в кадре обязан доходить до закрытых, а счётчики — до
    // скоростей: без того и другого замер прошёл бы мимо основной работы
    // разбора и мерил бы возврат прежних строк.
    expect(state.closed.length).toBeGreaterThan(0);
    expect(state.active.some((row) => row.downRate > 0)).toBe(true);
    expect(fastest(runs)).toBeLessThan(APPLY_BUDGET_MS);
  });

  it('объявляет сравнение для каждой колонки: без него список молча идёт в порядке потока', () => {
    const registered = { text: sortFn_text, basic: sortFn_basic, alphanumeric: sortFn_alphanumeric };

    for (const def of CONNECTION_COLUMNS) {
      expect(typeof def.sortFn).toBe('string');
      expect(registered).toHaveProperty(String(def.sortFn));
    }
  });
});
