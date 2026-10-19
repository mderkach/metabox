import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initI18n, preloadNamespaces } from './lib/i18n';
import { App } from './ui/App';

import './styles/index.css';

// Texts arrive before the first frame: react-i18next requires a ready instance,
// and a `Suspense` inside the shell would replace navigation with a fallback at
// startup. Only the shell's own dictionaries are here; the screen's dictionary
// is loaded by its route.
await initI18n();
await preloadNamespaces([
  'shared',
  'app',
  'widgets/AppSidebar',
  'features/Config/ConfigApply',
  'features/Device/DeviceRoute',
  'features/Theme/ThemeSwitch',
  'features/Language/LanguageSwitch',
  'features/Auth/AuthLogin',
  'features/Auth/AuthPassword',
  'features/Auth/AuthLogout',
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
