import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';

import { QueryClientInstance } from '@shared/api';
import { Toaster } from '@shared/ui';

import { Router } from '../router/Router';
import { DaemonBanner } from './DaemonBanner';

export function App() {
  return (
    <ThemeProvider attribute='class' defaultTheme='dark' enableSystem disableTransitionOnChange>
      <QueryClientProvider client={QueryClientInstance}>
        <div className='flex h-svh flex-col overflow-hidden'>
          <DaemonBanner />
          <div className='min-h-0 grow'>
            <RouterProvider router={Router} />
          </div>
        </div>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
