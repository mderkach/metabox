import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expectedI18nTypes } from './i18n.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');

describe('i18n.generated.d.ts', () => {
  // The i18n plugin rewrites the file from the dictionaries when Vitest starts, so the working
  // copy always matches; only the committed copy can be stale.
  it('is committed in the state the generator produces for the dictionaries on disk', () => {
    const committed = execFileSync('git', ['show', 'HEAD:./src/i18n.generated.d.ts'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    expect(
      committed,
      'src/i18n.generated.d.ts is stale or edited by hand: run `pnpm --filter web gen:i18n` and commit it'
    ).toBe(expectedI18nTypes(projectRoot));
  });
});
