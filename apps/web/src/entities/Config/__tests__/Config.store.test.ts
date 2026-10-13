import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../api/Config.query';
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
