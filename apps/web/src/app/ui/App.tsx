import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { QueryClientInstance } from '@shared/api';
import { Toaster } from '@shared/ui';

import { AuthGate } from './AuthGate';

const Panel = lazy(async () => import('./Panel').then(({ Panel }) => ({ default: Panel })));

/** Called only after the panel was shown, so the router module is already loaded. */
function reloadRoutes() {
  void import('../router/Router').then(async ({ Router }) => Router.invalidate());
}

export function App() {
  const { t } = useTranslation('app');

  return (
    <ThemeProvider attribute='class' defaultTheme='dark' enableSystem disableTransitionOnChange>
      <QueryClientProvider client={QueryClientInstance}>
        <div className='h-svh overflow-hidden'>
          <AuthGate onLogin={reloadRoutes}>
            <Suspense fallback={null}>
              <Panel />
            </Suspense>
          </AuthGate>
        </div>
        {/* At the top: the apply and interception bars hold the bottom edge with their buttons. */}
        <Toaster position='top-right' containerAriaLabel={t('toasts.label')} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
