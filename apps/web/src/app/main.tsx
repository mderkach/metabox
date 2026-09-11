import { enableMapSet } from 'immer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/index.css';
import { App } from './ui/App';

// Индекс потока соединений — `Map` (StateManagement.md). immer работает с Map и
// Set только с этим плагином; включается на входе приложения, а не рядом со
// стором, чтобы связь не держалась на порядке импортов.
enableMapSet();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
