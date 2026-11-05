import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentStore } from '@entities/Config';

import { useConfigLeaveGuard } from '../useConfigLeaveGuard';

const TEXT = '{"route":{"final":"proxy"}}';

function leavePage(): Event {
  const event = new Event('beforeunload', { cancelable: true });

  globalThis.dispatchEvent(event);

  return event;
}

describe('useConfigLeaveGuard', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().reset();
    ConfigDocumentStore.getState().load(TEXT);
  });

  it('with unapplied edits asks the browser to confirm leaving', () => {
    ConfigDocumentStore.getState().edit(['route', 'final'], 'direct');
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(true);
  });

  it('without edits does not block leaving', () => {
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('after the draft is discarded the confirmation is cleared', () => {
    ConfigDocumentStore.getState().edit(['route', 'final'], 'direct');
    renderHook(useConfigLeaveGuard);

    act(() => {
      ConfigDocumentStore.getState().discard();
    });

    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('starts confirming when the mounted document becomes dirty', () => {
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(false);

    act(() => {
      ConfigDocumentStore.getState().edit(['route', 'final'], 'direct');
    });

    expect(leavePage().defaultPrevented).toBe(true);
  });

  it('confirms leaving when only a list file has changed', () => {
    renderHook(useConfigLeaveGuard);

    act(() => {
      ConfigDocumentStore.getState().editList('custom.json', '{"rules":[]}');
    });

    expect(leavePage().defaultPrevented).toBe(true);

    act(() => {
      ConfigDocumentStore.getState().discard();
    });

    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('removes the confirmation when unmounted with a dirty document', () => {
    ConfigDocumentStore.getState().edit(['route', 'final'], 'direct');
    const { unmount } = renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(true);

    unmount();

    expect(leavePage().defaultPrevented).toBe(false);
  });
});
