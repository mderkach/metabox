import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickActiveNav, useSidebarCollapsed } from '../lib/AppSidebar.lib';

describe('текущий пункт меню', () => {
  const TARGETS = ['/overview', '/config', '/config/rule-set', '/connections'];

  it('вложенный раздел подсвечивает только себя, а не родителя вместе с ним', () => {
    expect(pickActiveNav('/config/rule-set', TARGETS)).toBe('/config/rule-set');
  });

  it('вкладка без своего пункта подсвечивает ближайший раздел', () => {
    expect(pickActiveNav('/config/raw', TARGETS)).toBe('/config');
  });

  it('точное совпадение подсвечивает раздел', () => {
    expect(pickActiveNav('/config', TARGETS)).toBe('/config');
  });

  it('неизвестный адрес не подсвечивает ничего', () => {
    expect(pickActiveNav('/nope', TARGETS)).toBeNull();
    expect(pickActiveNav('/configuration', TARGETS)).toBeNull();
  });
});

describe('свёрнутость сайдбара', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('без прежнего выбора открывается развёрнутым', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it('открывается так, как пользователь оставил её в прошлый раз', () => {
    globalThis.localStorage.setItem('metabox.sidebar.collapsed', 'true');

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(true);
  });

  it('переключение сохраняется и переживает перемонтирование', () => {
    const first = renderHook(() => useSidebarCollapsed());

    act(() => {
      first.result.current.toggle();
    });

    expect(first.result.current.collapsed).toBe(true);

    const second = renderHook(() => useSidebarCollapsed());

    expect(second.result.current.collapsed).toBe(true);
  });

  it('недоступное хранилище не роняет панель', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function denyRead() {
      throw new Error('доступ к хранилищу закрыт');
    });

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });
});
