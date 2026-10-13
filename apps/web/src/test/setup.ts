import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { FakePlot } from './fakePlot';
import { initTestI18n } from './i18n';
import { server } from './server';

await initTestI18n();

// Vitest globals are off, so Testing Library does not register its own cleanup.
afterEach(cleanup);

vi.mock('uplot', async () => ({ default: (await import('./fakePlot')).FakePlot }));

afterEach(() => {
  FakePlot.reset();
});

/**
 * jsdom has no ResizeObserver at all, and the list virtualizer without it does not
 * subscribe to scroll window changes. The stub reports a change
 * at once, and the test supplies sizes via `mockVirtualSizes`.
 */
class TestResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // An empty entry list: the library then measures the element itself, and the test
    // substitutes sizes via `mockVirtualSizes`.
    this.callback([], this);
  }

  unobserve(): void {
    // Observation is one-shot: nothing to unsubscribe.
  }

  disconnect(): void {
    // Observation is one-shot: nothing to disconnect.
  }
}

globalThis.ResizeObserver = TestResizeObserver;

/**
 * jsdom has no Web Animations API, and the Base UI scroll area asks the
 * viewport for current animations on a timer — after the test has ended,
 * so the failure arrives as an unhandled exception outside the test. Animations in
 * jsdom never exist, so the empty list here is not a simplification.
 */
Element.prototype.getAnimations = function getAnimations(): Animation[] {
  return [];
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
