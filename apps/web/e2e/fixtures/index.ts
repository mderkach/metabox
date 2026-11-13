import { expect, mergeTests } from '@playwright/test';

import { test as pageErrorsTest } from './pageErrors.ts';
import { test as pagesTest } from './pages.ts';

export const test = mergeTests(pageErrorsTest, pagesTest);

/** The stand a scenario holds on; a run picks its stand with `--grep`. */
export const E2E_TAG = {
  Mock: '@mock',
  Live: '@live',
} as const;

export { expect };
export { translate } from '../lib/i18n.ts';
