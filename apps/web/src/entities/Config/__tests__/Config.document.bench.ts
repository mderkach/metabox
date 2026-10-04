import { expect, test } from 'vitest';

import { ConfigSchema } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';

import { parseConfig } from '../api/Config.query';
import ROUTER_LIKE from './corpus/router-like.json?raw';

const VALUE = parseJsonc(ROUTER_LIKE).value;

/**
 * Цена одного разбора черновика — того, что `useConfigDocument` делает на каждый
 * введённый в текстовом режиме символ, — на файле корпуса со структурой рабочего
 * роутера, и обе её части порознь. Прогон: `pnpm --filter web exec vitest bench`.
 */
test('разбор черновика router-like.json', async ({ bench }) => {
  // Замер имеет смысл, только если схема файл принимает: отказ короче разбора.
  expect(parseConfig(ROUTER_LIKE).issues).toEqual([]);

  await bench.compare(
    bench('parseConfig целиком', () => {
      parseConfig(ROUTER_LIKE);
    }),
    bench('parseJsonc', () => {
      parseJsonc(ROUTER_LIKE);
    }),
    bench('ConfigSchema', () => {
      ConfigSchema.safeParse(VALUE);
    })
  );
});
