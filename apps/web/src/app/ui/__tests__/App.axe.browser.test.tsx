import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { createMissingHandlers } from '@test/handlers';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { ThemeProvider } from 'next-themes';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { QueryClientInstance } from '@shared/api';

import { createPanelRouter } from '../../router/Router';

/** WCAG 2.2 AA: axe tags every success criterion by the version and level that introduced it. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The data a screen shows once its requests are answered: axe runs on the filled screen, not on skeletons. */
const SCREENS = [
  { name: 'Overview', path: '/overview', heading: 'Обзор', ready: 'Всё работает' },
  { name: 'Editor', path: '/config', heading: 'Конфигурация', ready: 'Добавить правило' },
  { name: 'Rule sets', path: '/config/rule-set', heading: 'Конфигурация', ready: 'gemini' },
  { name: 'Connections', path: '/connections', heading: 'Соединения', ready: 'video.example:443' },
  { name: 'Proxies', path: '/proxies', heading: 'Прокси', ready: 'us-fallback' },
];

const THEMES = ['dark', 'light'];

const CASES = SCREENS.flatMap((screenCase) => THEMES.map((theme) => ({ ...screenCase, theme })));

/**
 * Violations not fixed yet: axe rule → number of failing elements. The test fails on any other count, so a new
 * element breaking a listed rule is caught and a fix shrinks the list: an inactive config tab is 4.49:1 on the
 * light tab strip, a proxy group card's `aria-label` leaves out the latency it shows.
 */
const KNOWN_VIOLATIONS: Record<string, Record<string, number>> = {
  'Editor light': { 'color-contrast': 1 },
  'Rule sets light': { 'color-contrast': 1 },
  'Proxies dark': { 'label-content-name-mismatch': 2 },
  'Proxies light': { 'label-content-name-mismatch': 2 },
};

const READY_TIMEOUT_MS = 10_000;

const unhandled: string[] = [];

const worker = setupWorker();

/** Fresh per case: the dev mocks keep state, such as the chosen node and the stream frame counter. */
function screenHandlers() {
  return [
    ...createMissingHandlers(),
    // The dev mock assembly leaves the list files to the daemon; without an answer the editor shows a load failure.
    http.get(CONFIG_ENDPOINT.ruleSetFiles(), () => HttpResponse.json({ files: {}, etag: '"lists"' })),
  ];
}

beforeAll(async () => {
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    quiet: true,
    onUnhandledRequest(request) {
      const { pathname } = new URL(request.url);

      if (pathname.startsWith('/api/')) {
        unhandled.push(`${request.method} ${pathname}`);
      }
    },
  });
});

// The cache is cleared before a render, not after: the setup's cleanup unmounts the previous screen later than a
// hook of this file would run.
beforeEach(() => {
  unhandled.length = 0;
  QueryClientInstance.clear();
  worker.resetHandlers(...screenHandlers());
});

afterAll(() => {
  worker.stop();
});

describe('main screens', () => {
  it.each(CASES)(
    '$name in the $theme theme passes the WCAG 2.2 AA check',
    async ({ name, path, heading, ready, theme }) => {
      render(
        <ThemeProvider attribute='class' forcedTheme={theme}>
          <QueryClientProvider client={QueryClientInstance}>
            <div className='h-svh overflow-hidden'>
              <RouterProvider router={createPanelRouter(createMemoryHistory({ initialEntries: [path] }))} />
            </div>
          </QueryClientProvider>
        </ThemeProvider>
      );

      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: READY_TIMEOUT_MS });
      await screen.findAllByText(ready, undefined, { timeout: READY_TIMEOUT_MS });
      // A fading element has an intermediate color, and the contrast check would measure it.
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
          .map(async (animation) => animation.finished)
      );

      const { violations } = await axe.run(document.body, { runOnly: { type: 'tag', values: WCAG_AA_TAGS } });
      const found = Object.fromEntries(violations.map((violation) => [violation.id, violation.nodes.length]));
      const details = violations.flatMap((violation) =>
        violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')} :: ${node.failureSummary}`)
      );

      expect(unhandled).toEqual([]);
      // On a mismatch the elements go into the message: they say where to look.
      expect({ found, details }).toEqual({ found: KNOWN_VIOLATIONS[`${name} ${theme}`] ?? {}, details });
    }
  );
});
