import { describe, expect, it } from 'vitest';

import { CONFIG_SECTION } from '../model/Config.model';
import { hasSubscriptionTagConflict, readSubscriptionTagReservations } from '../model/Config.subscriptionTags';

const TEXT = `{
  // Tags are compared verbatim; the URL does not reserve a tag.
  "providers": [
    { "type": "remote", "tag": "one", "url": "https://example.test/sub" },
    { "type": "remote", "tag": "", "url": "https://example.test/sub" },
    { "type": "remote", "tag": " spaced ", "url": "https://example.test/sub" },
  ],
  "endpoints": [{ "type": "wireguard" }, { "tag": "endpoint" }],
  "route": { "rule_set": [{ "type": "inline", "tag": "catalog" }] },
  "outbounds": [{ "type": "direct", "tag": "direct" }],
}`;

describe('subscription tag reservations', () => {
  it('collects tags from JSONC, including numeric defaults, without considering URLs or unrelated sections', () => {
    expect(readSubscriptionTagReservations(TEXT, CONFIG_SECTION.Providers)).toEqual([
      'one',
      '1',
      ' spaced ',
      '0',
      'endpoint',
      'catalog',
    ]);
    expect(readSubscriptionTagReservations(TEXT, CONFIG_SECTION.RuleSet)).toEqual(['one', '1', ' spaced ']);
    expect(readSubscriptionTagReservations(TEXT, CONFIG_SECTION.Outbounds)).toEqual([]);
  });

  it('rejects changes to a reserved tag and accepts a distinct tag for the same subscription URL', () => {
    expect(hasSubscriptionTagConflict(TEXT, ['providers', 0], 'catalog')).toBe(true);
    expect(hasSubscriptionTagConflict(TEXT, ['providers', 0], 'endpoint')).toBe(true);
    expect(hasSubscriptionTagConflict(TEXT, ['providers', 0], '')).toBe(true);
    expect(hasSubscriptionTagConflict(TEXT, ['endpoints', 1], undefined)).toBe(true);
    expect(hasSubscriptionTagConflict(TEXT, ['providers', 0], 'spaced')).toBe(false);
    expect(hasSubscriptionTagConflict(TEXT, ['providers', 0], 'new')).toBe(false);
  });

  it('leaves an unchanged tag alone even when the imported config already contains a conflict', () => {
    const text = '{"providers":[{"tag":"catalog"}],"route":{"rule_set":[{"tag":"catalog"}]}}';

    expect(hasSubscriptionTagConflict(text, ['providers', 0], 'catalog')).toBe(false);
  });
});
