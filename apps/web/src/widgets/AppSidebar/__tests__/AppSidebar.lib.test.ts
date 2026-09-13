import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSidebarCollapsed } from '../lib/AppSidebar.lib';

/**
 * `matchMedia` в jsdom нет вовсе — подставляем ответ на запрос ширины.
 * Подписка тоже нужна: хук следит за сменой ширины, а не замеряет её однажды.
 */
function mockNarrowScreen(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(function matchMediaStub(query: string) {
      return { matches, media: query, addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() };
    })
  );
}

describe('свёрнутость сайдбара', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('без прежнего выбора на узком экране открывается свёрнутым', () => {
    mockNarrowScreen(true);

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(true);
  });

  it('без прежнего выбора на широком экране открывается развёрнутым', () => {
    mockNarrowScreen(false);

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it('прежний выбор пользователя сильнее ширины экрана, пока экран широкий', () => {
    mockNarrowScreen(false);
    globalThis.localStorage.setItem('metabox.sidebar.collapsed', 'false');

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it('на узком экране сохранённое «развёрнуто» не действует', () => {
    mockNarrowScreen(true);
    globalThis.localStorage.setItem('metabox.sidebar.collapsed', 'false');

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(true);
    expect(result.current.narrow).toBe(true);
  });

  it('переключение сохраняется и переживает перемонтирование', () => {
    mockNarrowScreen(false);

    const first = renderHook(() => useSidebarCollapsed());

    act(() => {
      first.result.current.toggle();
    });

    expect(first.result.current.collapsed).toBe(true);

    const second = renderHook(() => useSidebarCollapsed());

    expect(second.result.current.collapsed).toBe(true);
  });

  it('недоступное хранилище не роняет панель', () => {
    mockNarrowScreen(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function denyRead() {
      throw new Error('доступ к хранилищу закрыт');
    });

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });
});
