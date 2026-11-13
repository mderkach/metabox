import { worker } from './browser';

/**
 * Entry point of dev mode with mocks. The app does not import it statically,
 * and `src` has no references to this directory: the `metabox-mocks` plugin
 * replaces the entry point in `index.html` on the dev server only, so nothing
 * from the mocks can end up in the build by construction.
 */
const APP_ENTRY = '/src/app/main.tsx';

await worker.start({
  onUnhandledRequest: 'warn',
  serviceWorker: { url: '/mockServiceWorker.js' },
  quiet: true,
});

// The path is a string: a static import would pull the app into the mocks
// project, and with it the Node types, which is exactly the coupling this file
// exists to avoid.
await import(/* @vite-ignore */ APP_ENTRY);
