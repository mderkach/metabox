import { mockVirtualSizes } from '@test/virtualSizes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RULE_TARGET, type RuleRow } from '@entities/Rule';

import { RuleTable } from '../ui/RuleTable';

const RULE_COUNT = 100;
const SELECTED_POSITION = 60;
const TALL = 600;
const SHORT = 300;
const ROW_HEIGHT = 52;

const RULES: RuleRow[] = Array.from({ length: RULE_COUNT }, (_, position) => ({
  id: String(position),
  index: position + 1,
  matchers: [],
  group: null,
  invert: false,
  target: 'direct',
  targetKind: RULE_TARGET.Outbound,
  targetDetail: null,
  isCatchAll: true,
  recognized: true,
  searchText: 'direct',
}));

let resizeCallbacks: ResizeObserverCallback[] = [];

class CapturingResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }

  observe(): void {
    // Sizes arrive from `mockVirtualSizes` when the test fires the captured callbacks.
  }

  unobserve(): void {
    // Nothing to unsubscribe.
  }

  disconnect(): void {
    // Nothing to disconnect.
  }
}

function resizeViewport(height: number) {
  mockVirtualSizes({ viewport: height });
  const observer = new CapturingResizeObserver(() => {});
  const callbacks = [...resizeCallbacks];

  act(() => {
    for (const callback of callbacks) {
      callback([], observer);
    }
  });
}

describe('RuleTable scroll to the selected rule', () => {
  const originalObserver = globalThis.ResizeObserver;
  let scrolledTo: number[];

  beforeEach(() => {
    resizeCallbacks = [];
    scrolledTo = [];
    globalThis.ResizeObserver = CapturingResizeObserver;
    mockVirtualSizes({ viewport: TALL });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(RULE_COUNT * ROW_HEIGHT);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: function scrollTo(this: HTMLElement, options: ScrollToOptions) {
        scrolledTo.push(options.top ?? 0);
      },
    });
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalObserver;
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    vi.restoreAllMocks();
  });

  function renderTable() {
    render(
      <RuleTable
        rules={RULES}
        total={RULE_COUNT}
        selectedId={String(SELECTED_POSITION)}
        empty={null}
        onSelect={vi.fn<(id: string) => void>()}
      />
    );
  }

  it('reveals the selected rule when the window shrinks during load', () => {
    renderTable();
    scrolledTo = [];

    resizeViewport(SHORT);

    expect(scrolledTo.length).toBeGreaterThan(0);
    expect(scrolledTo.at(-1)).toBeGreaterThan(SELECTED_POSITION * ROW_HEIGHT - TALL);
  });

  it('leaves the scroll position alone when the height changes after the user scrolled', () => {
    renderTable();
    fireEvent.wheel(screen.getByRole('table', { name: 'Правила маршрутизации' }));
    scrolledTo = [];

    resizeViewport(SHORT);
    resizeViewport(TALL);
    resizeViewport(SHORT);

    expect(scrolledTo).toEqual([]);
  });
});
