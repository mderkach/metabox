import { setupWorker } from 'msw/browser';

import { missingHandlers } from '../src/test/handlers';

export const worker = setupWorker(...missingHandlers);
