import { E2E_TAG, expect, test } from './fixtures/index.ts';

const SERVICE_UNAVAILABLE = 503;

test(
  'the mock stand isolates daemon requests outside the browser worker',
  { tag: E2E_TAG.Mock },
  async ({ request, overviewPage }) => {
    for (const path of ['/api/auth', '/healthz']) {
      const response = await request.get(path);

      expect(response.status()).toBe(SERVICE_UNAVAILABLE);
      expect(await response.json()).toMatchObject({ code: 'mock_worker_required' });
    }

    await overviewPage.goto();
    await expect(overviewPage.allWorks).toBeVisible();
  }
);

test(
  'reopens the same accumulated traffic shares after a reload',
  { tag: E2E_TAG.Mock },
  async ({ page, overviewPage }) => {
    await test.step('Open Overview from the root with the accumulated volumes', async () => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/overview$/);
      await expect(overviewPage.trafficPeriod).toBeVisible();
      await expect(overviewPage.trafficShares).toHaveText(/30\.0 MB\s*30%.*70\.0 MB\s*70%/s);
    });

    await test.step('Reload and read the same period and shares', async () => {
      await page.reload();
      await expect(overviewPage.trafficPeriod).toBeVisible();
      await expect(overviewPage.trafficShares).toHaveText(/30\.0 MB\s*30%.*70\.0 MB\s*70%/s);
    });
  }
);
