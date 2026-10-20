import { describe, expect, it } from 'vitest';

import { toRanges } from '../lib/ConfigNodeDelete.lib';

describe('toRanges', () => {
  it('folds runs of numbers and keeps single ones', () => {
    expect(toRanges([31, 6, 18, 19, 20, 22, 21])).toBe('6, 18–22, 31');
  });

  it('counts a repeated number once', () => {
    expect(toRanges([3, 3, 4])).toBe('3–4');
  });
});
