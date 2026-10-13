import { worker } from './browser';

/**
 * Entry point of dev mode with mocks. The app does not import it statically,
 * and `src` has no references to this directory: the `metabox-mocks` plugin
 * replaces the entry point in `index.html` on the dev server only, so nothing
 * from the mocks can end up in the build by construction.
 *
 * The `missing` mode passes existing daemon endpoints through to the daemon
 * itself, `all` answers everything on its own; otherwise the panel without a
 * daemon would show the failure banner over the mock.
 */
const MOCK_MODE = __METABOX_MOCK__;
const APP_ENTRY = '/src/app/main.tsx';

await worker.start({
  onUnhandledRequest: MOCK_MODE === 'all' ? 'warn' : 'bypass',
  serviceWorker: { url: '/mockServiceWorker.js' },
  quiet: true,
});

// The path is a string: a static import would pull the app into the mocks
// project, and with it the Node types, which is exactly the coupling this file
// exists to avoid.
await import(/* @vite-ignore */ APP_ENTRY);
