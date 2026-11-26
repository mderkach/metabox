import { createContext, type ComponentProps } from 'react';

import type { Dialog } from '@shared/ui';

export const ConfigNodeAddDialogContext = createContext<{
  handle: NonNullable<ComponentProps<typeof Dialog>['handle']>;
  ready: boolean;
  setReady: (ready: boolean) => void;
} | null>(null);
