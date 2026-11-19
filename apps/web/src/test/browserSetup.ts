import '@app/styles/index.css';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

import { initTestI18n } from './i18n';

await initTestI18n();

// The default 1 s wait of findBy* and waitFor fails correct tests on a loaded machine.
configure({ asyncUtilTimeout: 10_000 });

// Vitest globals are off, so Testing Library does not register its own cleanup.
afterEach(cleanup);

// Files of the browser project share one origin, so a draft the panel stored in the localStorage
// of one file would open as a pending change in the next.
afterEach(() => {
  localStorage.clear();
});
