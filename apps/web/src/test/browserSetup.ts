import '@app/styles/index.css';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

import { initTestI18n } from './i18n';

await initTestI18n();

// The default 1 s wait of findBy* and waitFor fails correct tests on a loaded machine.
configure({ asyncUtilTimeout: 10_000 });

// Vitest globals are off, so Testing Library does not register its own cleanup.
afterEach(cleanup);
