import { expect, test } from 'vitest';

import ROUTER_LIKE from '@entities/Config/__tests__/corpus/router-like.json?raw';
import { firstJsoncError } from '@shared/lib/jsonc';

import { findMatches, toJsonTokens } from '../lib';

/** Запрос поиска, у которого в файле корпуса много совпадений. */
const QUERY = 'outbound';

/**
 * Цена того, что текстовый редактор делает сам на каждый введённый символ, —
 * помимо разбора черновика, который меряет `Config.document.bench.ts`. Токены
 * подсветки и поиск идут в срочном рендере: слой подсветки лежит под прозрачным
 * полем и отставать от него не может. Ошибка разбора отложена за вводом.
 * Перерисовку слоя — несколько тысяч `span` — бенч не видит: её цену даёт
 * только профиль в браузере. Прогон: `pnpm --filter web exec vitest bench`.
 */
test('проход редактора по router-like.json', async ({ bench }) => {
  // Замер имеет смысл, только если текст разобран: ошибка обрывает проход раньше.
  expect(firstJsoncError(ROUTER_LIKE)).toBeNull();
  expect(findMatches(ROUTER_LIKE, QUERY).length).toBeGreaterThan(0);

  await bench.compare(
    bench('toJsonTokens', () => {
      toJsonTokens(ROUTER_LIKE);
    }),
    bench('firstJsoncError', () => {
      firstJsoncError(ROUTER_LIKE);
    }),
    bench('findMatches', () => {
      findMatches(ROUTER_LIKE, QUERY);
    })
  );
});
