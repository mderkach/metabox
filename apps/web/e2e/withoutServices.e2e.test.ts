import { parse } from 'jsonc-parser';

import { E2E_TAG, expect, test } from './fixtures/index.ts';

test(
  'Overview and Connections show data with a config without a services section',
  { tag: E2E_TAG.Live },
  async ({ page, overviewPage, connectionsPage, benchConnection }) => {
    await test.step('the bench config has no services section', async () => {
      const response = await page.request.get('/api/config');
      // The config is JSON with comments: the panel keeps a rule's name as a comment line.
      const config: unknown = parse(await response.text());

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
