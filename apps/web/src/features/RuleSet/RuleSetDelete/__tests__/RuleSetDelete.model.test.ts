import { afterEach, expect, it } from 'vitest';

import { ConfigDocumentStore, readRuleSets, selectConfigCurrent, selectListChanges } from '@entities/Config';

import { removeRuleSet } from '../model/RuleSetDelete.model';

afterEach(() => {
  ConfigDocumentStore.getState().reset();
});

it.each([
  'rule-sets/shared.json',
  './rule-sets/shared.json',
  'rule-sets/imported/../shared.json',
  'rule-sets/{tag}.json',
])('keeps a shared local file until the last reference is removed: %s', (path) => {
  const file = 'shared.json';
  const first = { type: 'local', tag: 'first', path: 'rule-sets/shared.json' };
  const second = { ...first, tag: 'shared', path };
  const text = JSON.stringify({ route: { rule_set: [first, second] } });
  const applied = '{"version":3,"rules":[{"domain":["original.example"]}]}';
  const updated = '{"version":3,"rules":[{"domain":["updated.example"]}]}';
  const document = ConfigDocumentStore.getState();
  document.load(text);
  document.loadLists({ [file]: applied }, '"lists"');
  document.editList(file, updated);

  expect(removeRuleSet(0, () => {})).toBe(true);

  const remaining = ConfigDocumentStore.getState();
  expect(readRuleSets(selectConfigCurrent(remaining) ?? '')).toEqual([second]);
  expect(selectListChanges(remaining)).toEqual({ put: { [file]: updated }, remove: [] });

  expect(removeRuleSet(0, () => {})).toBe(true);

  const emptied = ConfigDocumentStore.getState();
  expect(readRuleSets(selectConfigCurrent(emptied) ?? '')).toEqual([]);
  expect(selectListChanges(emptied)).toEqual({ put: {}, remove: [file] });
});
