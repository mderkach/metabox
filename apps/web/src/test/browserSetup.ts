import '@app/styles/index.css';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { initTestI18n } from './i18n';

await initTestI18n();

// Vitest globals are off, so Testing Library does not register its own cleanup.
afterEach(cleanup);
