import { describe, expect, it } from 'vitest';

import { findMatches } from '../lib/ConfigRawEditor.lib';

describe('text search', () => {
  it('finds all occurrences and is case-insensitive', () => {
    expect(findMatches('direct Direct DIRECT', 'direct')).toEqual([0, 7, 14]);
  });

  it('an empty query searches for nothing', () => {
    expect(findMatches('direct', '')).toEqual([]);
  });

  it('occurrences do not overlap', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([0, 2]);
  });
});
