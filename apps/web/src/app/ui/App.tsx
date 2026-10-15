import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';

import { QueryClientInstance } from '@shared/api';
import { Toaster } from '@shared/ui';

import { Router } from '../router/Router';
import { AuthGate } from './AuthGate';

function reloadRoutes() {
  void Router.invalidate();
}

export function App() {
  return (
    <ThemeProvider attribute='class' defaultTheme='dark' enableSystem disableTransitionOnChange>
      <QueryClientProvider client={QueryClientInstance}>
        <div className='h-svh overflow-hidden'>
          <AuthGate onLogin={reloadRoutes}>
            <RouterProvider router={Router} />
          </AuthGate>
        </div>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
