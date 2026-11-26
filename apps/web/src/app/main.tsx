import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AUTH_LOGIN_NS } from '@features/Auth/AuthLogin';
import { AUTH_LOGOUT_NS } from '@features/Auth/AuthLogout';
import { CONFIG_APPLY_NS } from '@features/Config/ConfigApply';
import { DEVICE_ROUTE_NS } from '@features/Device/DeviceRoute';
import { LANGUAGE_SWITCH_NS } from '@features/Language/LanguageSwitch';
import { THEME_SWITCH_NS } from '@features/Theme/ThemeSwitch';
import { SHARED_NS } from '@shared/i18n';
import { APP_SIDEBAR_NS } from '@widgets/AppSidebar';

import { APP_NS } from './i18n';
import { initI18n, preloadNamespaces } from './lib/i18n';
import { App } from './ui/App';

import './styles/index.css';

// Texts arrive before the first frame: react-i18next requires a ready instance,
// and a `Suspense` inside the shell would replace navigation with a fallback at
// startup. Only the shell's own dictionaries are here; the screen's dictionary
// is loaded by its route.
await initI18n();
await preloadNamespaces([
  SHARED_NS,
  APP_NS,
  APP_SIDEBAR_NS,
  CONFIG_APPLY_NS,
  DEVICE_ROUTE_NS,
  THEME_SWITCH_NS,
  LANGUAGE_SWITCH_NS,
  AUTH_LOGIN_NS,
  AUTH_LOGOUT_NS,
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
