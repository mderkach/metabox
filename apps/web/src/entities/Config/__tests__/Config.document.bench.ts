import { expect, test } from 'vitest';

import { ConfigSchema } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';

import { parseConfig } from '../api/Config.query';
import ROUTER_LIKE from './corpus/router-like.json?raw';

const VALUE = parseJsonc(ROUTER_LIKE).value;

/**
 * The cost of one draft parse, which `useConfigDocument` does on every
 * character typed in text mode, on a corpus file with the structure of a working
 * router, and both of its parts separately. Run: `pnpm --filter web exec vitest bench`.
 */
test('draft parse of router-like.json', async ({ bench }) => {
  // The measurement makes sense only if the schema accepts the file: a rejection is shorter than a parse.
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
