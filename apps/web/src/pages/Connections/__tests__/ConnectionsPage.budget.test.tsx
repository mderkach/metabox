import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { CLOSED_LIMIT, ConnectionStore, parseConnectionSearch } from '@entities/Connection';
import { advanceConnectionsSnapshot, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { MS_IN_SECOND } from '@shared/lib/time';

import { ConnectionsPage } from '../ui/ConnectionsPage';

/** Потолок нагрузки: столько соединений панель обязана держать (NFR-2). */
const SNAPSHOT_SIZE = 5000;
/** Первые тики дороже остальных: прогрев JIT и первый замер виртуализатора. */
const WARMUP = 3;
const RUNS = 10;
/**
 * Экран на пять тысяч строк и полтора десятка тиков: под нагрузкой соседних
 * файлов тест не укладывается в пять секунд Vitest по умолчанию.
 */
const TEST_TIMEOUT_MS = 30 * MS_IN_SECOND;

/**
 * Тик снапшота на экране соединений: разбор кадра на 5000 соединений и рендер
 * экрана при открытой вкладке «Активные», а скрытая «Закрытые» держит полный
 * лимит строк.
 *
 * Замер 2026-10-04, Node 24.21.0, jsdom, четыре vCPU под нагрузкой соседних
 * процессов, по 120 тиков на вариант, прогоны вперемешку:
 *
 * - до перестройки экрана: 75.6 мс медиана, 48.6 мс лучший тик, когда скрытая
 *   вкладка рендерит свою таблицу, тулбар и подвал; 60.8 и 38.2 мс, когда её
 *   таблица не рендерится вовсе. Скрытая вкладка стоила около 15 мс — пятую
 *   часть тика;
 * - после: 71.6 и 40.6 мс, когда скрытая вкладка получает замороженный набор, против
 *   78.0 и 46.1 мс на той же разметке с живым набором и без `memo` у тела.
 *
 * jsdom медленнее браузера, и абсолютные числа переносить нельзя — доля
 * скрытой вкладки в тике переносится. Браузерного профиля этого замера нет.
 *
 * Порог с запасом в разы, как у бюджета таблицы: файлы тестов идут
 * параллельно, и соседи отбирают процессор. Тест ловит подорожание в разы —
 * отрисовку всех строк мимо виртуализатора или перерисовку скрытой вкладки
 * целиком, — а не микрорегрессию.
 */
const TICK_BUDGET_MS = 250;

/** Лучший из прогонов: шум замер только замедляет, нижняя граница — собственная цена. */
function fastest(values: number[]): number {
  return Math.min(...values);
}

describe('бюджет экрана соединений', () => {
  beforeEach(() => {
    localStorage.clear();
    ConnectionStore.getState().reset();
    mockVirtualSizes();
    server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(JSON.stringify(CONFIG_FIXTURE))));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'тик снапшота на 5000 соединений укладывается в бюджет, пока закрытые спрятаны',
    async () => {
      // Часы сдвигаются на шаг потока: подряд идущие кадры разбор считает
      // неправдоподобно частыми и скорости не считает, а это его основная работа.
      let clock = Date.now();

      vi.spyOn(Date, 'now').mockImplementation(() => clock);

      const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
      let seq = 0;

      function nextFrame() {
        seq += 1;
        clock += MS_IN_SECOND;

        return advanceConnectionsSnapshot(snapshot, seq);
      }

      // Оборот кадра уводит соединения в закрытые: копим их до лимита, чтобы
      // скрытая вкладка держала столько строк, сколько бывает на роутере.
      while (ConnectionStore.getState().closed.length < CLOSED_LIMIT) {
        ConnectionStore.getState().apply(nextFrame());
      }

      renderWithRouter(ConnectionsPage, {
        path: '/connections',
        validateSearch: parseConnectionSearch,
        initialEntry: '/connections',
      });

      await screen.findAllByRole('button', { name: /Закрыть соединение/ });

      const runs = Array.from({ length: WARMUP + RUNS }, () => {
        const frame = nextFrame();
        const start = performance.now();

        act(() => {
          ConnectionStore.getState().apply(frame);
        });

        return performance.now() - start;
      });

      expect(ConnectionStore.getState().closed).toHaveLength(CLOSED_LIMIT);
      expect(fastest(runs.slice(WARMUP))).toBeLessThan(TICK_BUDGET_MS);
    },
    TEST_TIMEOUT_MS
  );
});
