import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Свой клиент на тест: общий кэш связал бы тесты порядком выполнения. */
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
