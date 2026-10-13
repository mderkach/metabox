import { describe, expect, it } from 'vitest';

import { toAppliedIndices } from '../model/Rule.applied';

const DNS = { protocol: 'dns', action: 'hijack-dns' };
const GOOGLE = { rule_set: 'google-ip', outbound: 'proxy' };
const LOCAL = { ip_is_private: true, outbound: 'direct' };

describe('toAppliedIndices', () => {
  it('without edits returns the same indexes', () => {
    expect(toAppliedIndices([DNS, GOOGLE], [DNS, GOOGLE])).toEqual([0, 1]);
  });

  it('a moved rule finds its index in the applied config', () => {
    expect(toAppliedIndices([GOOGLE, DNS], [DNS, GOOGLE])).toEqual([1, 0]);
  });

  it('a changed and a new rule find no pair', () => {
    expect(toAppliedIndices([{ ...GOOGLE, outbound: 'direct' }, LOCAL, DNS], [DNS, GOOGLE])).toEqual([null, null, 0]);
  });

  it('hands out duplicates in order instead of returning the first twice', () => {
    expect(toAppliedIndices([DNS, DNS, DNS], [DNS, GOOGLE, DNS])).toEqual([0, 2, null]);
  });
});
