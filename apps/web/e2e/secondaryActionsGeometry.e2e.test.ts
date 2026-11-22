import type { Locator, Page } from '@playwright/test';

import { E2E_TAG, expect, test } from './fixtures/index.ts';

const MIN_PHONE_WIDTH = 320;
const PHONE_WIDTH = 375;
const PHONE_WIDTHS = [MIN_PHONE_WIDTH, PHONE_WIDTH] as const;
const THEMES = ['light', 'dark'] as const;
const PHONE_HEIGHT = 812;
const RULE = { title: '192.168.1.100/32 → direct', index: 4 };
const RULE_NAME = 'Printer';
const PROXY_GROUP = 'proxy';
const INITIAL_SECONDS = 60;
const ONE_DIGIT_SECONDS = 9;
const MS_PER_SECOND = 1000;

async function phone(page: Page, width: number, theme: (typeof THEMES)[number]) {
  await page.setViewportSize({ width, height: PHONE_HEIGHT });
  await page.addInitScript((value) => {
    localStorage.setItem('theme', value);
  }, theme);
}

async function phoneLayout(page: Page, width: number, container: Locator, controls: readonly Locator[]) {
  await page.evaluate('document.fonts.ready.then(() => undefined)');
  await expect
    .poll(async () => page.evaluate<number>('document.documentElement.scrollWidth'))
    .toBeLessThanOrEqual(width);
  await expect
    .poll(async () =>
      container.evaluate(
        (element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth
      )
    )
    .toBe(0);

  return Promise.all(
    controls.map(async (control) => {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (box === null) throw new Error('Visible control has no bounds');

      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(PHONE_HEIGHT);

      return box;
    })
  );
}

async function groupControlLayout(page: Page, width: number, group: Locator, controls: readonly Locator[]) {
  const boxes = await phoneLayout(page, width, group, controls);
  const origin = await group.boundingBox();
  if (origin === null) throw new Error('Visible group has no bounds');

  return boxes.map((box) => ({ ...box, x: box.x - origin.x, y: box.y - origin.y }));
}

for (const width of PHONE_WIDTHS) {
  for (const theme of THEMES) {
    test(
      `keeps proxy group controls aligned while editing a label at ${String(width)} px in ${theme}`,
      { tag: E2E_TAG.Mock },
      async ({ page, proxiesPage, applyBar }) => {
        await phone(page, width, theme);
        await proxiesPage.goto();
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);

        const group = proxiesPage.group(PROXY_GROUP);
        const edit = proxiesPage.editGroupLabel(PROXY_GROUP);
        const field = proxiesPage.groupLabelField(PROXY_GROUP);
        const controls = [proxiesPage.groupHeading(PROXY_GROUP), edit, proxiesPage.testGroup(PROXY_GROUP)];
        await edit.scrollIntoViewIfNeeded();
        const atRest = await groupControlLayout(page, width, group, controls);

        await test.step('opens the label editor without moving neighboring controls', async () => {
          await edit.press('Enter');
          await expect(field).toBeFocused();
          expect(await groupControlLayout(page, width, group, controls)).toEqual(atRest);
          await expect(applyBar.region).toBeHidden();
        });

        await test.step('returns keyboard focus and preserves the action positions after cancellation', async () => {
          await field.press('Escape');
          await expect(field).toBeHidden();
          await expect(edit).toBeFocused();
          expect(await groupControlLayout(page, width, group, controls)).toEqual(atRest);
        });
      }
    );

    test(
      `keeps draft controls aligned before Apply and during confirmation at ${String(width)} px in ${theme}`,
      { tag: E2E_TAG.Mock },
      async ({ page, configPage, applyBar }) => {
        await phone(page, width, theme);
        await page.clock.install();
        await configPage.goto();
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        await configPage.openRule(RULE.title, RULE.index);
        await configPage.ruleName.fill(RULE_NAME);
        await page.keyboard.press('Escape');

        await test.step('opens secondary draft actions without moving the status or Apply', async () => {
          const neighbors = [applyBar.dirty, applyBar.applyButton];
          const controls = [applyBar.more, ...neighbors];
          const atRest = await phoneLayout(page, width, applyBar.region, controls);

          await applyBar.more.press('Enter');
          await expect(applyBar.discard).toBeFocused();
          const expanded = await phoneLayout(page, width, applyBar.region, [...neighbors, applyBar.discard]);
          expect(expanded.slice(0, neighbors.length)).toEqual(atRest.slice(1));

          await applyBar.discard.press('Escape');
          await expect(applyBar.more).toBeFocused();
          expect(await phoneLayout(page, width, applyBar.region, controls)).toEqual(atRest);

          await applyBar.more.press('Tab');
          await expect(applyBar.applyButton).toBeFocused();
        });

        await test.step('keeps the confirmation prompt and action fixed as the countdown changes', async () => {
          await applyBar.applyButton.press('Enter');
          await applyBar.confirmDiff();
          await expect(applyBar.remainingSeconds(INITIAL_SECONDS)).toBeVisible();
          const controls = [applyBar.confirmPrompt, applyBar.keepButton];
          const awaiting = await phoneLayout(page, width, applyBar.region, controls);

          await page.clock.runFor((INITIAL_SECONDS - ONE_DIGIT_SECONDS) * MS_PER_SECOND);
          await expect(applyBar.remainingSeconds(ONE_DIGIT_SECONDS)).toBeVisible();
          expect(await phoneLayout(page, width, applyBar.region, controls)).toEqual(awaiting);

          await applyBar.keepButton.press('Enter');
          await expect(applyBar.confirmed).toBeVisible();
        });
      }
    );
  }
}
