import { test as base, expect } from '@playwright/test';

/** Fails the test on an uncaught exception in the page, even when every assertion passed. */
export const test = base.extend<{ noPageErrors: undefined }>({
  noPageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];

      page.on('pageerror', (error) => {
        errors.push(error);
      });
      await use(undefined);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
