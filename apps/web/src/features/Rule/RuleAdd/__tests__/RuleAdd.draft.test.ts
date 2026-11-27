import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentStore, readRuleNames, readRules, selectConfigCurrent } from '@entities/Config';

import { useCreateRule } from '../model/RuleAdd.draft';

const TEXT = `{
  "route": {
    "rules": [
      // Existing rule
      { "domain": ["existing.example"], "outbound": "proxy" }
    ]
  }
}`;
const FIRST = { domain: ['first.example'], outbound: 'proxy' };
const SECOND = { domain: ['second.example'], outbound: 'proxy' };
const PLACE = { index: 1, outbound: 'proxy' };

describe('new rules in the draft', () => {
  afterEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  it('publishes a new rule with its name and keeps the neighbor intact on a repeated write', () => {
    const document = ConfigDocumentStore.getState();
    document.load(TEXT);
    const onCreated = vi.fn<(index: number, node: unknown) => void>();
    const { result } = renderHook(() => useCreateRule(PLACE, onCreated));
    const published: string[] = [];
    const unsubscribe = ConfigDocumentStore.subscribe((state) => published.push(selectConfigCurrent(state) ?? ''));

    try {
      expect(result.current?.(FIRST, 'New rule')).toBe(true);
      expect(result.current?.(SECOND, 'Renamed rule')).toBe(true);
      expect(onCreated).toHaveBeenCalledExactlyOnceWith(PLACE.index, FIRST);
      expect(published).toHaveLength(2);
      expect(published.map((text) => readRuleNames(text))).toEqual([
        ['New rule', 'Existing rule'],
        ['Renamed rule', 'Existing rule'],
      ]);
      expect(published.map((text) => readRules(text)[0])).toEqual([FIRST, SECOND]);
      expect(published[1]).toContain('{ "domain": ["existing.example"], "outbound": "proxy" }');
      expect(readRules(published[1])).toHaveLength(2);
    } finally {
      unsubscribe();
    }
  });

  it('refuses a repeated write from the pending form after the draft changes', () => {
    const document = ConfigDocumentStore.getState();
    document.load(TEXT);
    const { result } = renderHook(() => useCreateRule(PLACE, () => {}));
    expect(result.current?.(FIRST, 'New rule')).toBe(true);
    document.edit(['log', 'level'], 'warn');
    const latest = selectConfigCurrent(ConfigDocumentStore.getState());

    expect(result.current?.(SECOND, 'Renamed rule')).toBe(false);
    expect(selectConfigCurrent(ConfigDocumentStore.getState())).toBe(latest);
  });
});
