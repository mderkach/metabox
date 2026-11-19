import { E2E_TAG, expect, test } from './fixtures/index.ts';

test(
  'Overview and Connections show data with a config without a services section',
  { tag: E2E_TAG.Live },
  async ({ page, overviewPage, connectionsPage, benchConnection }) => {
    await test.step('the bench config has no services section', async () => {
      const response = await page.request.get('/api/config');
      const config: unknown = await response.json();

      expect(response.ok()).toBe(true);
      expect(config).not.toHaveProperty('services');
    });

    await test.step('the overview reads the runtime', async () => {
      await overviewPage.goto();

      await expect(overviewPage.allWorks).toBeVisible();
    });

    await test.step('the connection list shows a connection through sing-box', async () => {
      await connectionsPage.goto();

      await expect(connectionsPage.explainButton(benchConnection)).toBeVisible();
    });
  }
);
