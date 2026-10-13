import { describe, expect, it } from 'vitest';

import { toRuleSetCatalog } from '@entities/RuleSet';
import { RULE_SET_CATALOG_FIXTURE } from '@entities/RuleSet/__tests__/RuleSet.fixture';

import { RULE_SET_ADD_ERROR } from '../model/RuleSetAdd.constants';
import { makeRuleSetAddSchema, ruleSetAddDefaults, toRuleSetPatch } from '../model/RuleSetAdd.schema';

const GEOSITE_GOOGLE = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs';

const OUTBOUNDS = ['direct', 'proxy'];

function filled(overrides: Partial<ReturnType<typeof ruleSetAddDefaults>> = {}) {
  return {
    ...ruleSetAddDefaults(toRuleSetCatalog(RULE_SET_CATALOG_FIXTURE)),
    category: 'google',
    url: GEOSITE_GOOGLE,
    tag: 'geosite-google',
    ...overrides,
  };
}

describe('makeRuleSetAddSchema', () => {
  it('accepts a filled form', () => {
    expect(makeRuleSetAddSchema([]).safeParse(filled()).success).toBe(true);
  });

  // The tag is the reference by which a rule finds the rule set: a second rule set with the same
  // name would make it ambiguous.
  it('does not accept a taken name', () => {
    const parsed = makeRuleSetAddSchema(['geosite-google']).safeParse(filled());

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.TagTaken);
  });

  it('does not accept an address without a scheme', () => {
    const parsed = makeRuleSetAddSchema([]).safeParse(filled({ url: 'example.com/list.srs' }));

    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.UrlScheme);
  });

  // For an address without an extension there is nothing to derive the format from, and without it the core will not understand
  // what it downloaded.
  it('requires a format when the address does not suggest it', () => {
    const parsed = makeRuleSetAddSchema([]).safeParse(filled({ url: 'https://example.com/list?id=5' }));

    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.FormatRequired);
  });

  it('accepts a duration in the binary format and rejects the rest', () => {
    expect(makeRuleSetAddSchema([]).safeParse(filled({ updateInterval: '12h' })).success).toBe(true);
    expect(makeRuleSetAddSchema([]).safeParse(filled({ updateInterval: '1h30m' })).success).toBe(true);
    expect(makeRuleSetAddSchema([]).safeParse(filled({ updateInterval: '' })).success).toBe(true);

    for (const interval of ['12 hours', 'abc']) {
      const parsed = makeRuleSetAddSchema([]).safeParse(filled({ updateInterval: interval }));

      expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.IntervalFormat);
    }
  });

  it('requires the download node to be among the outbounds', () => {
    expect(makeRuleSetAddSchema([], OUTBOUNDS).safeParse(filled({ detour: 'proxy' })).success).toBe(true);
    expect(makeRuleSetAddSchema([], OUTBOUNDS).safeParse(filled({ detour: '' })).success).toBe(true);

    const parsed = makeRuleSetAddSchema([], OUTBOUNDS).safeParse(filled({ detour: 'proxi' }));

    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.DetourUnknown);
  });

  it('without the outbound list does not check the download node', () => {
    expect(makeRuleSetAddSchema([], []).safeParse(filled({ detour: 'proxi' })).success).toBe(true);
  });
});

describe('toRuleSetPatch', () => {
  // A value equal to the derived one is dropped by the core on save, and in
  // the diff it would look like an edit the user did not make.
  it('does not write the format when it is visible from the extension', () => {
    expect(toRuleSetPatch(filled({ format: 'binary' }))).toEqual({
      type: 'remote',
      tag: 'geosite-google',
      url: GEOSITE_GOOGLE,
    });
  });

  it('writes the format when the extension does not suggest it', () => {
    const patch = toRuleSetPatch(filled({ url: 'https://example.com/list?id=5', format: 'source' }));

    expect(patch.format).toBe('source');
  });

  it('does not write empty optional fields', () => {
    const patch = toRuleSetPatch(filled({ updateInterval: '', detour: '' }));

    expect(patch).not.toHaveProperty('update_interval');
    expect(patch).not.toHaveProperty('download_detour');
  });

  it('writes the interval and node when they are set', () => {
    const patch = toRuleSetPatch(filled({ updateInterval: '3d', detour: 'proxy' }));

    expect(patch.update_interval).toBe('3d');
    expect(patch.download_detour).toBe('proxy');
  });
});
