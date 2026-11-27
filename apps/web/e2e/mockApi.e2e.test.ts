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
