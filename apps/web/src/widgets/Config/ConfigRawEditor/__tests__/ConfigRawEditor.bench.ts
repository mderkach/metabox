import { expect, test } from 'vitest';

import ROUTER_LIKE from '@entities/Config/__tests__/corpus/router-like.json?raw';
import { firstJsoncError } from '@shared/lib/jsonc';
import { toJsonTokens } from '@shared/ui/JsonTextarea.lib';

import { findMatches } from '../lib';

/** A search query with many matches in the corpus file. */
const QUERY = 'outbound';

/**
 * The cost of what the text editor does itself for every typed character,
 * beyond draft parsing, which `Config.document.bench.ts` measures. Highlight
 * tokens and search run in an urgent render: the highlight layer sits under a transparent
 * field and cannot lag behind it. The parse error is deferred behind the input.
 * The layer redraw, several thousand `span`s, the bench does not see: its cost is given
 * only by a browser profile. Run: `pnpm --filter web exec vitest bench`.
 */
test('editor pass over router-like.json', async ({ bench }) => {
  // The measurement makes sense only if the text is parsed: an error breaks the pass earlier.
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
