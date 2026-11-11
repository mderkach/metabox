import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConfigDiff, useConfigDirty, useConfigStale, useConfigCurrent, useListChanges } from '../model/Config.hooks';
import {
  selectConfigCurrent,
  selectConfigDirty,
  selectConfigLoaded,
  selectConfigStale,
  selectListChanges,
} from '../model/Config.selectors';
import { ConfigDocumentStore } from '../model/Config.store';

const APPLIED = '{"log":{"level":"error"}}';
const DRAFT = '{"log":{"level":"debug"}}';

describe('config document subscriptions', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks loading, edits, external changes and discard', () => {
    const { result } = renderHook(() => ({
      current: useConfigCurrent(),
      dirty: useConfigDirty(),
      stale: useConfigStale(),
    }));

    expect(result.current).toEqual({ current: null, dirty: false, stale: false });

    act(() => {
      ConfigDocumentStore.getState().load(APPLIED);
    });
    expect(result.current).toEqual({ current: APPLIED, dirty: false, stale: false });

    act(() => {
      ConfigDocumentStore.getState().replace(DRAFT);
    });
    expect(result.current).toEqual({ current: DRAFT, dirty: true, stale: false });

    act(() => {
      ConfigDocumentStore.getState().load('{}');
    });
    expect(result.current).toEqual({ current: DRAFT, dirty: true, stale: true });

    act(() => {
      ConfigDocumentStore.getState().discard();
    });
    expect(result.current).toEqual({ current: '{}', dirty: false, stale: false });
  });

  it('tracks list-only changes and drops writes equal to the device content', () => {
    const document = ConfigDocumentStore.getState();

    document.loadLists({ 'rules.json': '{}' }, 'lists');
    const { result } = renderHook(() => ({ dirty: useConfigDirty(), lists: useListChanges() }));

    act(() => {
      document.editList('rules.json', '[]');
    });
    expect(result.current).toEqual({ dirty: true, lists: { put: { 'rules.json': '[]' }, remove: [] } });

    act(() => {
      document.loadLists({ 'rules.json': '[]' }, 'updated');
    });
    expect(result.current).toEqual({ dirty: false, lists: { put: {}, remove: [] } });

    act(() => {
      document.removeList('rules.json');
    });
    expect(result.current).toEqual({ dirty: true, lists: { put: {}, remove: ['rules.json'] } });

    act(() => {
      document.discard();
    });
    expect(result.current).toEqual({ dirty: false, lists: { put: {}, remove: [] } });
  });

  it('keeps the diff and file changes stable across unrelated updates', () => {
    const document = ConfigDocumentStore.getState();

    document.load(APPLIED);
    document.replace(DRAFT);
    document.editList('rules.json', '{}');
    const { result, rerender } = renderHook(() => ({ diff: useConfigDiff(), lists: useListChanges() }));
    const before = result.current;

    act(() => {
      document.load(APPLIED, 'etag');
    });
    rerender();

    expect(result.current.diff).toBe(before.diff);
    expect(result.current.lists).toBe(before.lists);
  });

  it('does not persist unrelated device updates', () => {
    const document = ConfigDocumentStore.getState();

    document.load(APPLIED);
    document.replace(DRAFT);
    const write = vi.spyOn(Storage.prototype, 'setItem');

    document.load('{}', 'etag');
    document.loadLists({ 'rules.json': '{}' }, 'lists');

    expect(write).not.toHaveBeenCalled();
  });
});

describe('config document selectors', () => {
  it('computes from the supplied snapshot independently of later store changes', () => {
    const document = ConfigDocumentStore.getState();

    document.reset();
    document.load(APPLIED);
    document.loadLists({ 'old.json': '{}' }, 'lists');
    document.replace(DRAFT);
    document.editList('new.json', '[]');
    const snapshot = ConfigDocumentStore.getState();

    document.load('{}');
    document.discard();

    expect(selectConfigCurrent(snapshot)).toBe(DRAFT);
    expect(selectConfigDirty(snapshot)).toBe(true);
    expect(selectConfigStale(snapshot)).toBe(false);
    expect(selectListChanges(snapshot)).toEqual({ put: { 'new.json': '[]' }, remove: [] });
    expect(selectConfigCurrent(ConfigDocumentStore.getState())).toBe('{}');
    expect(selectConfigDirty(ConfigDocumentStore.getState())).toBe(false);
  });

  it('counts the document as loaded only with the device file and, for list edits, the list files', () => {
    const document = ConfigDocumentStore.getState();

    document.reset();
    ConfigDocumentStore.setState({ draft: DRAFT });

    expect(selectConfigLoaded(ConfigDocumentStore.getState())).toBe(false);

    document.load(APPLIED);

    expect(selectConfigLoaded(ConfigDocumentStore.getState())).toBe(true);

    document.editList('new.json', '[]');

    expect(selectConfigLoaded(ConfigDocumentStore.getState())).toBe(false);

    document.loadLists({}, 'lists');

    expect(selectConfigLoaded(ConfigDocumentStore.getState())).toBe(true);
  });
});
