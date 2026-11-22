import { describe, expect, it } from 'vitest';

import { getAppliedRuleIndex, getRuleEditorSearch } from '../model/Route.reference';

const REFERENCE = { index: 0, etag: '"applied"' };

describe('verified rule references', () => {
  it('reads a zero-based applied index only at the confirmed revision', () => {
    expect(getAppliedRuleIndex(REFERENCE, '"applied"')).toBe(0);
    expect(getAppliedRuleIndex(REFERENCE, '"reordered"')).toBeNull();
    expect(getAppliedRuleIndex(REFERENCE, null)).toBeNull();
    expect(getAppliedRuleIndex(null, '"applied"')).toBeNull();
  });

  it('builds a guarded one-based link only for the applied editor document', () => {
    expect(getRuleEditorSearch(REFERENCE, { appliedEtag: '"applied"', hasDraft: false })).toEqual({
      rule: 1,
      ruleEtag: '"applied"',
    });
    expect(getRuleEditorSearch(REFERENCE, { appliedEtag: '"applied"', hasDraft: true })).toEqual({});
    expect(getRuleEditorSearch(REFERENCE, { appliedEtag: '"reordered"', hasDraft: false })).toEqual({});
    expect(getRuleEditorSearch(null, { appliedEtag: '"applied"', hasDraft: false })).toEqual({});
  });
});
