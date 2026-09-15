import { enableMapSet } from 'immer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initI18n, preloadNamespaces } from './lib/i18n';
import { App } from './ui/App';

import './styles/index.css';

// Индекс потока соединений — `Map` (StateManagement.md). immer работает с Map и
// Set только с этим плагином; включается на входе приложения, а не рядом со
// стором, чтобы связь не держалась на порядке импортов.
enableMapSet();

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
