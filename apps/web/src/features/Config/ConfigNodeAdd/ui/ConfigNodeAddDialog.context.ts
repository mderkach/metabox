import { createContext, type ComponentProps } from 'react';

import type { Dialog } from '@shared/ui';

export const ConfigNodeAddDialogContext = createContext<ComponentProps<typeof Dialog>['handle']>(undefined);
