import { setupWorker } from 'msw/browser';

import { createMissingHandlers } from '../src/test/handlers';

export const worker = setupWorker(...createMissingHandlers(__METABOX_MOCK_CONNECTIONS__));
