import { describe, expect, it } from 'vitest';

import { findValue, setValue } from '@entities/Config';

import { planDnsFallback, readDnsFallbacks, type DnsFallbackEdit } from '../model/ConfigDnsEdit.fallback';

const VERSION = '1.14.3-extended-2.7.3';
const GROUP = 4;
const MEMBERS = '["2", "b" /* b */, "a"]';
const TEXT =
  '{"dns":{"servers":[{"type":"local","tag":"a"},{"type":"local","tag":"b"},{"type":"local"},{"type":"local","tag":"c"},{"type":"fallback","tag":"chain","timeout":"3s","servers":' +
  MEMBERS +
  '},{"type":"local","tag":"later"}],"final":"chain","rules":[]},"log":{/* imported */"disabled":true}}';
const PATH = ['dns', 'servers', GROUP];

describe('fallback transport', () => {
  it.each([undefined, '', 'sequential'])('reads the actual member order for strategy %s', (strategy) => {
    const text = strategy === undefined ? TEXT : setValue(TEXT, [...PATH, 'strategy'], strategy);
    expect(readDnsFallbacks(text, VERSION).chains).toMatchObject([
      { tag: 'chain', members: ['2', 'b', 'a'], choices: ['c'], reason: null },
    ]);
  });
  it.each([
    [{ add: 'c' }, '["2", "b" /* b */, "a", "c"]'],
    [{ remove: 'a' }, '["2", "b" /* b */]'],
    [{ move: 'b', to: 2 }, '["2", "a", "b" /* b */]'],
  ] satisfies [DnsFallbackEdit, string][])('patches only the member array for %j', (edit, members) => {
    const plan = planDnsFallback(TEXT, VERSION, GROUP, edit);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.text).toBe(TEXT.replace(MEMBERS, members));
  });
  it('keeps own-line imported annotations attached on a move', () => {
    const text = TEXT.replace(MEMBERS, '[\n    "2",\n    // secondary resolver\n    "b",\n    "a"\n  ]');
    const plan = planDnsFallback(text, VERSION, GROUP, { move: 'b', to: 2 });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.text).toContain('// secondary resolver\n    "b"');
    expect(findValue(plan.text, [...PATH, 'servers'])).toEqual(['2', 'a', 'b']);
  });
  it.each([
    { remove: '2' },
    { move: '2', to: 2 },
    { move: 'a', to: 0 },
    { add: 'chain' },
    { add: 'later' },
    { add: 'b' },
  ] satisfies DnsFallbackEdit[])('rejects a first-server edit or unregistered member %j', (edit) => {
    expect(planDnsFallback(TEXT, VERSION, GROUP, edit).ok).toBe(false);
  });
  it.each([
    ['strategy', 'parallel'],
    ['strategy', 'custom'],
    ['servers', ['2', 'b', 'b']],
    ['servers', ['2', 'later']],
    ['servers', []],
    ['extra', true],
  ])('preserves imported %s=%j', (field, value) => {
    const text = setValue(TEXT, [...PATH, String(field)], value);
    const model = readDnsFallbacks(text, VERSION);
    expect(model.chains).toHaveLength(1);
    expect(model.chains[0].reason).not.toBeNull();
    expect(planDnsFallback(text, VERSION, GROUP, { add: 'c' }).ok).toBe(false);
  });
  it('refuses a malformed scalar member list without interpreting it as a chain', () => {
    const text = setValue(TEXT, [...PATH, 'servers'], 'a');
    expect(readDnsFallbacks(text, VERSION)).toEqual({ chains: [], problem: 'draft' });
    expect(planDnsFallback(text, VERSION, GROUP, { add: 'b' }).ok).toBe(false);
  });
  it('refuses editing on an unverified core and ambiguous JSONC', () => {
    expect(readDnsFallbacks(TEXT, undefined).chains[0].reason).toBe('core');
    expect(
      planDnsFallback(TEXT.replace('"timeout":"3s"', '"timeout":"1s","timeout":"3s"'), VERSION, GROUP, { add: 'c' }).ok
    ).toBe(false);
    expect(planDnsFallback(TEXT.replace('"tag":"later"', '"tag":"2"'), VERSION, GROUP, { add: 'c' }).ok).toBe(false);
  });
});
