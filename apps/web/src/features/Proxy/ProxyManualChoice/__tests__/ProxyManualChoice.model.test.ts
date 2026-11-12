import { describe, expect, it } from 'vitest';

import { readSectionNodes } from '@entities/Config';

import {
  applyManualChoice,
  MANUAL_CHOICE,
  planManualChoice,
  toManualChoiceStatus,
} from '../model/ProxyManualChoice.model';

const TEXT = JSON.stringify({
  outbounds: [
    { type: 'vless', tag: 'node-a' },
    { type: 'urltest', tag: 'auto', outbounds: ['node-a'], providers: 'sub', include: 'EU', interval: '1m' },
    { type: 'direct', tag: 'auto-auto' },
  ],
  route: { final: 'auto' },
});

function apply(text: string, group: string): string {
  const plan = planManualChoice(text, group);
  const next = plan === null ? null : applyManualChoice(text, plan);

  if (next === null) throw new Error('no manual choice');

  return next;
}

describe('manual choice over an automatic group', () => {
  it('puts a selector under the old tag right after the group and keeps the group as its default', () => {
    const outbounds = readSectionNodes(apply(TEXT, 'auto'), 'outbounds');

    expect(outbounds[1]).toEqual(expect.objectContaining({ type: 'urltest', tag: 'auto-auto-2', interval: '1m' }));
    expect(outbounds[2]).toEqual({
      type: 'selector',
      tag: 'auto',
      outbounds: ['auto-auto-2', 'node-a'],
      providers: 'sub',
      include: 'EU',
    });
  });

  it('does not touch the references: they now lead to the selector', () => {
    expect(apply(TEXT, 'auto')).toContain('"final":"auto"');
  });

  it('reports the selector already in the draft and does not wrap it twice', () => {
    const text = apply(TEXT, 'auto');

    expect(toManualChoiceStatus(text, 'auto')).toBe(MANUAL_CHOICE.Added);
    expect(planManualChoice(text, 'auto')).toBeNull();
  });

  // After Apply the renamed group shows up as an automatic group of its own.
  it('does not wrap the automatic half of an existing manual choice again', () => {
    const text = apply(TEXT, 'auto');

    expect(toManualChoiceStatus(text, 'auto-auto-2')).toBe(MANUAL_CHOICE.Wrapped);
    expect(planManualChoice(text, 'auto-auto-2')).toBeNull();
  });

  it('offers nothing for a group that is not an outbound of the file or a file not loaded', () => {
    expect(toManualChoiceStatus(TEXT, 'missing')).toBe(MANUAL_CHOICE.Unavailable);
    expect(toManualChoiceStatus(null, 'auto')).toBe(MANUAL_CHOICE.Unavailable);
    expect(toManualChoiceStatus(TEXT, 'auto')).toBe(MANUAL_CHOICE.Available);
  });
});
