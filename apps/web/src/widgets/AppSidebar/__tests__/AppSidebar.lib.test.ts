import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickActiveNav, useSidebarCollapsed } from '../lib/AppSidebar.lib';

describe('current menu item', () => {
  const TARGETS = ['/overview', '/config', '/config/rule-set', '/connections'];

  it('a nested section highlights only itself, not the parent together with it', () => {
    expect(pickActiveNav('/config/rule-set', TARGETS)).toBe('/config/rule-set');
  });

  it('a tab without its own item highlights the nearest section', () => {
    expect(pickActiveNav('/config/raw', TARGETS)).toBe('/config');
  });

  it('an exact match highlights the section', () => {
    expect(pickActiveNav('/config', TARGETS)).toBe('/config');
  });

  it('an unknown address highlights nothing', () => {
    expect(pickActiveNav('/nope', TARGETS)).toBeNull();
    expect(pickActiveNav('/configuration', TARGETS)).toBeNull();
  });
});

describe('sidebar collapsed state', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('without a previous choice opens expanded', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it('opens as the user left it last time', () => {
    globalThis.localStorage.setItem('metabox.sidebar.collapsed', 'true');

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(true);
  });

  it('the toggle is saved and survives remounting', () => {
    const first = renderHook(() => useSidebarCollapsed());

    act(() => {
      first.result.current.toggle();
    });

    expect(first.result.current.collapsed).toBe(true);

    const second = renderHook(() => useSidebarCollapsed());

    expect(second.result.current.collapsed).toBe(true);
  });

  it('unavailable storage does not crash the panel', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function denyRead() {
      throw new Error('доступ к хранилищу закрыт');
    });

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });
});
