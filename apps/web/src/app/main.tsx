import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initI18n, preloadNamespaces } from './lib/i18n';
import { App } from './ui/App';

import './styles/index.css';

// Тексты приезжают до первого кадра: react-i18next требует поднятый инстанс,
// а `Suspense` внутри оболочки заменил бы навигацию заглушкой на старте.
// Здесь только словари самой оболочки — словарь экрана грузит его маршрут.
await initI18n();
await preloadNamespaces([
  'shared',
  'app',
  'widgets/AppSidebar',
  'features/Config/ConfigApply',
  'features/Theme/ThemeSwitch',
  'features/Language/LanguageSwitch',
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
