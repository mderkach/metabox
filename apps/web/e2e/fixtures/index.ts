import { expect, mergeTests } from '@playwright/test';

import { test as benchTest } from './bench.ts';
import { test as connectionLoadTest } from './connectionLoad.ts';
import { test as pageErrorsTest } from './pageErrors.ts';
import { test as pagesTest } from './pages.ts';

export const test = mergeTests(benchTest, connectionLoadTest, pageErrorsTest, pagesTest);

/** The stand a scenario holds on; a run picks its stand with `--grep`. */
export const E2E_TAG = {
  Mock: '@mock',
  Live: '@live',
  Load: '@load',
} as const;

export { expect };
export { translate } from '../lib/i18n.ts';
