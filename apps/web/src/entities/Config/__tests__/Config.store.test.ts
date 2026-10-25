import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fingerprint } from '@shared/lib/fingerprint';

import { parseConfig } from '../api/Config.query';
import { findValue, readRules } from '../model/Config.model';
import { ConfigDocumentState, useConfigLeaveGuard } from '../model/Config.store';
import { CONFIG_FIXTURE } from './Config.fixture';

const TEXT = JSON.stringify(CONFIG_FIXTURE, null, 2);

function state() {
  return ConfigDocumentState.getState();
}

describe('ConfigDocumentState', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('before the config is read there is nothing to edit', () => {
    state().edit(['route', 'final'], 'direct');

    expect(state().draft).toBeNull();
    expect(state().current()).toBeNull();
  });

  it('without edits there is no draft, and the applied config is shown', () => {
    state().load(TEXT);

    expect(state().draft).toBeNull();
    expect(state().isDirty()).toBe(false);
    expect(state().current()).toBe(TEXT);
  });

  it('remembers the file fingerprint and clears it on reset', () => {
    state().load(TEXT, '"abc"');

    expect(state().appliedEtag).toBe('"abc"');

    state().reset();

    expect(state().appliedEtag).toBeNull();
  });

  it('without a fingerprint the base is empty: apply goes without a check', () => {
    state().load(TEXT);

    expect(state().appliedEtag).toBeNull();
  });

  it('a new fingerprint of the same text does not move the revision', () => {
    state().load(TEXT, '"a"');

    const { revision } = state();

    state().load(TEXT, '"b"');

    expect(state().appliedEtag).toBe('"b"');
    expect(state().revision).toBe(revision);
  });

  it('an edit goes to the draft, the applied config stays as it was', () => {
    state().load(TEXT);
    state().edit(['route', 'default_mark'], 200);

    expect(state().applied).toBe(TEXT);
    expect(state().isDirty()).toBe(true);
    expect(parseConfig(state().current() ?? '').config?.route?.default_mark).toBe(200);
  });

  it('a second edit lands on the first, not on the applied config', () => {
    state().load(TEXT);
    state().edit(['route', 'default_mark'], 200);
    state().edit(['route', 'final'], 'direct');

    const config = parseConfig(state().current() ?? '').config;

    expect(config?.route?.default_mark).toBe(200);
    expect(config?.route?.final).toBe('direct');
  });

  it('a batch of edits lands as a single store update', () => {
    state().load(TEXT);

    let updates = 0;
    const unsubscribe = ConfigDocumentState.subscribe(() => {
      updates += 1;
    });

    state().editMany([
      { path: ['route', 'default_mark'], value: 200 },
      { path: ['route', 'final'], value: 'direct' },
    ]);
    unsubscribe();

    const config = parseConfig(state().current() ?? '').config;

    expect(updates).toBe(1);
    expect(config?.route?.default_mark).toBe(200);
    expect(config?.route?.final).toBe('direct');
  });

  it('a batch edit without a value removes the key', () => {
    state().load(TEXT);
    expect(parseConfig(TEXT).config?.route).toHaveProperty('default_domain_resolver');

    state().editMany([{ path: ['route', 'default_domain_resolver'], value: undefined }]);

    expect(parseConfig(state().current() ?? '').config?.route).not.toHaveProperty('default_domain_resolver');
  });

  it('an empty batch does not create a draft', () => {
    state().load(TEXT);
    state().editMany([]);

    expect(state().draft).toBeNull();
  });

  it('cancel returns the applied config', () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');
    state().discard();

    expect(state().isDirty()).toBe(false);
    expect(state().current()).toBe(TEXT);
  });

  it('a move changes the rule order and does not touch the others', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];

    state().load(TEXT);
    state().move(['route', 'rules'], 0, 1);

    const left = parseConfig(state().current() ?? '').config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length);
    expect(left[0]).toEqual(rules[1]);
    expect(left[1]).toEqual(rules[0]);
    expect(left.slice(2)).toEqual(rules.slice(2));
  });

  it('a move does not rewrite the text: the set of lines stays as it was', () => {
    state().load(TEXT);
    state().move(['route', 'rules'], 0, 1);

    const before = TEXT.split('\n').sort();
    const after = (state().current() ?? '').split('\n').sort();

    expect(after).toEqual(before);
  });

  it('a move to the same place does not touch the config', () => {
    state().load(TEXT);
    state().move(['route', 'rules'], 3, 3);

    expect(state().isDirty()).toBe(false);
  });

  it('a move of a nonexistent rule does not touch the config', () => {
    state().load(TEXT);
    state().move(['route', 'rules'], 999, 0);

    expect(state().isDirty()).toBe(false);
  });

  it('a move of the last step puts the rule at the end of the list', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];
    const last = rules.length - 1;

    state().load(TEXT);
    state().move(['route', 'rules'], last - 1, last);

    const left = parseConfig(state().current() ?? '').config?.route?.rules ?? [];

    expect(left.at(-1)).toEqual(rules[last - 1]);
    expect(left.at(-2)).toEqual(rules[last]);
    expect((state().current() ?? '').split('\n').sort()).toEqual(TEXT.split('\n').sort());
  });

  it('an insert into a config without route.rules creates the list and does not touch the rest of the text', () => {
    const text = JSON.stringify(
      { outbounds: [{ type: 'direct', tag: 'direct' }], route: { final: 'direct' } },
      null,
      2
    );

    state().load(text);
    state().insert(['route', 'rules', 0], { outbound: 'direct' });

    const rules = ['    "rules": [', '      {', '        "outbound": "direct"', '      }', '    ]'].join('\n');

    // The previous lines stay as they were; `final` gets only a comma before the new key.
    expect(state().current()).toBe(text.replace('"final": "direct"', `"final": "direct",\n${rules}`));
  });

  it('deleting and inserting a rule go through the same draft', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];

    state().load(TEXT);
    state().remove(['route', 'rules', 0]);
    state().insert(['route', 'rules', 0], { action: 'route', outbound: 'direct' });

    const left = parseConfig(state().current() ?? '').config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length);
    expect(left[0]).toEqual({ action: 'route', outbound: 'direct' });
    expect(left[1]).toEqual(rules[1]);
  });
});

/**
 * Rules written one per line, as people write them by hand, with a comment inside
 * the rule that moves and one above it.
 */
const ONE_LINE_RULES = `{
  "route": {
    "rules": [
      { "action": "sniff" },
      // DNS goes to the resolver
      { "protocol": "dns", /* hijack */ "action": "hijack-dns" },
      { "ip_is_private": true, "outbound": "direct" },
      {
        "domain_suffix": [".example"],
        "outbound": "direct"
      },
      { "port": [80, 443], "outbound": "proxy" }
    ],
    "final": "proxy"
  }
}
`;

/** Lines an edit added, counted as a multiset: a repeated line counts as many times as it occurs. */
function addedLines(before: string, after: string): string[] {
  const left = before.split('\n');

  return after.split('\n').filter((line) => {
    const found = left.indexOf(line);

    if (found === -1) return true;

    left.splice(found, 1);

    return false;
  });
}

function removedLines(before: string, after: string): string[] {
  return addedLines(after, before);
}

/** A hand-written config from the corpus: one-line rules and a comma before the closing bracket. */
const HANDWRITTEN = Object.values(
  import.meta.glob<string>('./corpus/handwritten.jsonc', { query: '?raw', import: 'default', eager: true })
)[0];

describe('ConfigDocumentState array edits on one-line rules', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('a move carries the rule text with its comments and changes nothing else', () => {
    state().load(ONE_LINE_RULES);
    state().move(['route', 'rules'], 1, 3);

    const after = state().current() ?? '';
    const moved = [
      '      // DNS goes to the resolver',
      '      { "protocol": "dns", /* hijack */ "action": "hijack-dns" },',
    ];

    expect(after.split('\n').sort()).toEqual(ONE_LINE_RULES.split('\n').sort());
    expect(after).toBe(
      ONE_LINE_RULES.replace(`${moved.join('\n')}\n`, '').replace(
        '        "outbound": "direct"\n      },\n',
        `        "outbound": "direct"\n      },\n${moved.join('\n')}\n`
      )
    );
  });

  it('a move to the end gives the old last rule a comma and keeps the moved one on one line', () => {
    state().load(ONE_LINE_RULES);
    state().move(['route', 'rules'], 0, 4);

    const after = state().current() ?? '';

    expect(after).toContain('      { "port": [80, 443], "outbound": "proxy" },\n      { "action": "sniff" }\n    ],');
    expect(removedLines(ONE_LINE_RULES, after)).toEqual([
      '      { "action": "sniff" },',
      '      { "port": [80, 443], "outbound": "proxy" }',
    ]);
  });

  it('appending keeps the previous last rule on one line', () => {
    state().load(ONE_LINE_RULES);
    state().insert(['route', 'rules', 5], { outbound: 'direct' });

    const after = state().current() ?? '';

    expect(removedLines(ONE_LINE_RULES, after)).toEqual(['      { "port": [80, 443], "outbound": "proxy" }']);
    expect(addedLines(ONE_LINE_RULES, after)).toEqual([
      '      { "port": [80, 443], "outbound": "proxy" },',
      '      {',
      '        "outbound": "direct"',
      '      }',
    ]);
  });

  it('inserting in the middle touches neither neighbour', () => {
    state().load(ONE_LINE_RULES);
    state().insert(['route', 'rules', 1], { outbound: 'direct' });

    expect(removedLines(ONE_LINE_RULES, state().current() ?? '')).toEqual([]);
    expect(readRules(state().current() ?? '')[1]).toEqual({ outbound: 'direct' });
  });

  it('deleting a rule in the middle keeps the next one on one line', () => {
    state().load(ONE_LINE_RULES);
    state().remove(['route', 'rules', 2]);

    const after = state().current() ?? '';

    expect(addedLines(ONE_LINE_RULES, after)).toEqual([]);
    expect(removedLines(ONE_LINE_RULES, after)).toEqual(['      { "ip_is_private": true, "outbound": "direct" },']);
  });

  it.each([0, 1, 3, 4])('deleting rule %i of a list with a trailing comma keeps the next one on one line', (index) => {
    state().load(HANDWRITTEN);
    state().remove(['route', 'rules', index]);

    const after = state().current() ?? '';

    expect(addedLines(HANDWRITTEN, after)).toEqual([]);
    expect(readRules(after)).toEqual(readRules(HANDWRITTEN).toSpliced(index, 1));
  });

  it('deleting a rule takes its comments with it', () => {
    state().load(ONE_LINE_RULES);
    state().remove(['route', 'rules', 1]);

    expect(removedLines(ONE_LINE_RULES, state().current() ?? '')).toEqual([
      '      // DNS goes to the resolver',
      '      { "protocol": "dns", /* hijack */ "action": "hijack-dns" },',
    ]);
  });

  it('deleting the last rule takes the comma from the previous one only', () => {
    state().load(ONE_LINE_RULES);
    state().remove(['route', 'rules', 4]);

    const after = state().current() ?? '';

    expect(removedLines(ONE_LINE_RULES, after)).toEqual([
      '      },',
      '      { "port": [80, 443], "outbound": "proxy" }',
    ]);
    expect(addedLines(ONE_LINE_RULES, after)).toEqual(['      }']);
  });

  it('a list with a trailing comma keeps it', () => {
    const text = '{ "rules": [\n  { "a": 1 },\n  { "b": 2 },\n] }\n';

    state().load(text);
    state().remove(['rules', 1]);
    expect(state().current()).toBe('{ "rules": [\n  { "a": 1 },\n] }\n');

    state().insert(['rules', 1], 3);
    expect(state().current()).toBe('{ "rules": [\n  { "a": 1 },\n  3,\n] }\n');
  });

  it('a list written on one line stays on one line', () => {
    const text = '{ "ports": [80, 443, 8080] }';

    state().load(text);
    state().insert(['ports', 3], 22);
    expect(state().current()).toBe('{ "ports": [80, 443, 8080, 22] }');

    state().move(['ports'], 0, 3);
    expect(state().current()).toBe('{ "ports": [443, 8080, 22, 80] }');

    state().remove(['ports', 1]);
    expect(state().current()).toBe('{ "ports": [443, 22, 80] }');
  });

  it('a comment on its own line above the first rule moves with it', () => {
    state().load('{ "r": [\n  // about A\n  "A",\n  "B",\n  "C"\n] }');
    state().move(['r'], 0, 2);

    expect(state().current()).toBe('{ "r": [\n  "B",\n  "C",\n  // about A\n  "A"\n] }');
  });

  it('a commented-out rule before the closing bracket survives deleting the last rule', () => {
    state().load('{ "r": [\n  "A",\n  "B"\n  // "disabled"\n] }');
    state().remove(['r', 1]);

    expect(state().current()).toBe('{ "r": [\n  "A"\n  // "disabled"\n] }');
  });

  it('a move in a one-line list of two keeps the space after the comma', () => {
    state().load('{ "p": [80, 443] }');
    state().move(['p'], 1, 0);

    expect(state().current()).toBe('{ "p": [443, 80] }');
  });

  it('a line comment that would swallow the next rules falls back to a move by value', () => {
    state().load('{"r": [\n  1, 2, // two\n  3\n]}');
    state().move(['r'], 1, 0);

    expect(findValue(state().current() ?? '', ['r'])).toEqual([2, 1, 3]);
  });

  it('a negative position leaves the text to modify', () => {
    state().load('{ "r": [1, 2, 3] }');
    state().move(['r'], 0, -1);

    expect(findValue(state().current() ?? '', ['r'])).toHaveLength(3);
  });

  it('a trailing comment of a rule moves with it and does not swallow the comma', () => {
    const text = '{ "rules": [\n  1, // one\n  2\n] }';

    state().load(text);
    state().move(['rules'], 0, 1);

    expect(state().current()).toBe('{ "rules": [\n  2,\n  1 // one\n] }');
  });
});

describe('list files in the draft', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    state().load(TEXT);
    state().loadLists({ 'my.json': '{"version":1}' }, 'etag-1');
  });

  it('changes reduce to real ones: the same content and a foreign deletion drop out', () => {
    state().editList('my.json', '{"version":1}');
    state().removeList('absent.json');

    expect(state().listChanges()).toEqual({ put: {}, remove: [] });
    expect(state().isDirty()).toBe(false);
  });

  it('editing and deleting files make the document a draft without a text edit', () => {
    state().editList('new.json', '{"version":1,"rules":[]}');
    state().removeList('my.json');

    expect(state().listChanges()).toEqual({
      put: { 'new.json': '{"version":1,"rules":[]}' },
      remove: ['my.json'],
    });
    expect(state().isDirty()).toBe(true);
    expect(state().draft).toBeNull();
  });

  it('cancelling edits clears the files too', () => {
    state().editList('new.json', '{}');
    state().discard();

    expect(state().listChanges()).toEqual({ put: {}, remove: [] });
    expect(state().isDirty()).toBe(false);
  });
});

/** The same config, rewritten on the device: the log level differs. */
const CHANGED = TEXT.replace('"error"', '"debug"');

/** Page reload: the store module runs again and reads the browser. */
async function reloadStore() {
  vi.resetModules();

  const reloaded = await import('../model/Config.store');

  return reloaded.ConfigDocumentState;
}

/** The one record the store keeps in the browser. */
function storedRecord(): string {
  return globalThis.localStorage.getItem(globalThis.localStorage.key(0) ?? '') ?? '';
}

function leavePage(): Event {
  const event = new Event('beforeunload', { cancelable: true });

  globalThis.dispatchEvent(event);

  return event;
}

describe('ConfigDocumentState: draft in the browser', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    globalThis.localStorage.clear();
  });

  it('edits survive a reload and land on the same config silently', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');
    const draft = state().draft;

    const reloaded = (await reloadStore()).getState();

    expect(reloaded.draft).toBe(draft);

    reloaded.load(TEXT);

    expect(reloaded.isDirty()).toBe(true);
    expect(reloaded.isStale()).toBe(false);
  });

  it('list files in the draft also survive a reload', async () => {
    state().load(TEXT);
    state().loadLists({}, null);
    state().editList('ads.json', '{"version":3,"rules":[]}');

    const reloaded = (await reloadStore()).getState();

    reloaded.loadLists({}, null);

    expect(reloaded.listChanges()).toEqual({ put: { 'ads.json': '{"version":3,"rules":[]}' }, remove: [] });
  });

  it('warns when the config on the device changed since the draft', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const reloaded = await reloadStore();

    reloaded.getState().load(CHANGED);

    expect(reloaded.getState().isStale()).toBe(true);
    expect(reloaded.getState().applied).toBe(CHANGED);
  });

  it('the warning holds until the draft is discarded, and discarding clears the browser record', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const store = await reloadStore();

    store.getState().load(CHANGED);
    store.getState().edit(['route', 'final'], 'block');

    expect(store.getState().isStale()).toBe(true);

    store.getState().discard();

    expect(store.getState().isStale()).toBe(false);
    expect((await reloadStore()).getState().draft).toBeNull();
  });

  it('a config that changed on the device mid-session also gives a warning', () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');
    state().load(CHANGED);

    expect(state().isStale()).toBe(true);
  });

  it('keeps a fingerprint of the base in the browser, not the config text', () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const record = storedRecord();
    const parsed: unknown = JSON.parse(record);

    expect(record).not.toContain(JSON.stringify(TEXT));
    expect(parsed).toMatchObject({ base: fingerprint(TEXT) });
  });

  it('a record written with the config text as its base is kept as a draft and rewritten without the text', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const key = globalThis.localStorage.key(0) ?? '';
    const draft = state().draft;

    globalThis.localStorage.setItem(key, JSON.stringify({ base: TEXT, draft, lists: {} }));

    const reloaded = (await reloadStore()).getState();
    const rewritten = storedRecord();
    const parsed: unknown = JSON.parse(rewritten);

    expect(reloaded.draft).toBe(draft);
    expect(rewritten).not.toContain(JSON.stringify(TEXT));
    expect(parsed).toMatchObject({ base: fingerprint(TEXT), version: 2 });

    reloaded.load(CHANGED);

    expect(reloaded.isStale()).toBe(true);

    reloaded.load(TEXT);

    expect(reloaded.isStale()).toBe(false);
  });

  it('a record of a later version is read as no draft, not as a text base', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const key = globalThis.localStorage.key(0) ?? '';

    globalThis.localStorage.setItem(key, JSON.stringify({ version: 3, base: 'x', draft: '{}', lists: {} }));

    expect((await reloadStore()).getState().draft).toBeNull();
  });

  it('a foreign storage record is read as no draft', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);

      if (key !== null) globalThis.localStorage.setItem(key, '{"draft":1}');
    }

    expect((await reloadStore()).getState().draft).toBeNull();
  });
});

describe('useConfigLeaveGuard', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('with unapplied edits asks the browser to confirm leaving', () => {
    state().edit(['route', 'final'], 'direct');
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(true);
  });

  it('without edits does not block leaving', () => {
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('after the draft is discarded the confirmation is cleared', () => {
    state().edit(['route', 'final'], 'direct');
    renderHook(useConfigLeaveGuard);

    act(() => {
      state().discard();
    });

    expect(leavePage().defaultPrevented).toBe(false);
  });
});
