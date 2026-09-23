import { describe, expect, it } from 'vitest';

import { toAppliedIndices } from '../model/Rule.applied';

const DNS = { protocol: 'dns', action: 'hijack-dns' };
const GOOGLE = { rule_set: 'google-ip', outbound: 'proxy' };
const LOCAL = { ip_is_private: true, outbound: 'direct' };

describe('toAppliedIndices', () => {
  it('без правок отдаёт те же индексы', () => {
    expect(toAppliedIndices([DNS, GOOGLE], [DNS, GOOGLE])).toEqual([0, 1]);
  });

  it('переставленное правило находит свой индекс в применённом конфиге', () => {
    expect(toAppliedIndices([GOOGLE, DNS], [DNS, GOOGLE])).toEqual([1, 0]);
  });

  it('изменённое и новое правило не находят пары', () => {
    expect(toAppliedIndices([{ ...GOOGLE, outbound: 'direct' }, LOCAL, DNS], [DNS, GOOGLE])).toEqual([null, null, 0]);
  });

  it('раздаёт дубли по порядку, а не отдаёт первый дважды', () => {
    expect(toAppliedIndices([DNS, DNS, DNS], [DNS, GOOGLE, DNS])).toEqual([0, 2, null]);
  });
});
