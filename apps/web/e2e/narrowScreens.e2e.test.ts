import { SHARED_NS } from '../src/shared/i18n/Shared.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const PHONE = { width: 400, height: 812 } as const;
// The narrowest width where the connections are a table, not cards: its columns do not fit beside the sidebar.
const TABLET = { width: 800, height: 812 } as const;
const SCREENS = [
  '/overview',
  '/config',
  '/config/rule-set',
  '/config/raw',
  '/config/outbounds',
  '/proxies',
  '/connections',
  '/devices',
  '/logs',
  '/diagnostics',
  '/settings',
];

// The scenarios are typed without the DOM library, so the code that runs in the page is a string.
const PAGE_WIDTH = 'document.documentElement.scrollWidth';

const CONNECTIONS = translate(SHARED_NS, 'section.connections');

/** Scrolls the connections table sideways and says how far its first column header and its first cell moved. */
const SCROLL_SIDEWAYS = `(() => {
  const table = document.querySelector('[role="table"][aria-label="${CONNECTIONS}"]');
  const header = table.querySelector('[role="columnheader"]');
  const cell = table.querySelector('[role="cell"]');
  const before = { header: header.getBoundingClientRect().x, cell: cell.getBoundingClientRect().x };

  table.scrollLeft += 80;

  return { header: before.header - header.getBoundingClientRect().x, cell: before.cell - cell.getBoundingClientRect().x };
})()`;

for (const path of SCREENS) {
  test(
    `${path} at ${String(PHONE.width)} px does not scroll the page sideways`,
    { tag: E2E_TAG.Mock },
    async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      expect(await page.evaluate<number>(PAGE_WIDTH)).toBeLessThanOrEqual(PHONE.width);
    }
  );
}

test(
  'the connections table scrolls sideways together with its header, the page does not',
  { tag: E2E_TAG.Mock },
  async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto('/connections');

    await expect(page.getByRole('table', { name: CONNECTIONS }).getByRole('cell')).not.toHaveCount(0);

    const moved = await page.evaluate<{ header: number; cell: number }>(SCROLL_SIDEWAYS);

    expect(moved.header).toBeGreaterThan(0);
    expect(moved.header).toBe(moved.cell);
    expect(await page.evaluate<number>(PAGE_WIDTH)).toBeLessThanOrEqual(TABLET.width);
  }
);
