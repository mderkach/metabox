import { Dialog } from '@base-ui/react/dialog';
import { useState, type ReactNode } from 'react';

import { ConfigNodeAddDialogContext } from './ConfigNodeAddDialog.context';

export function ConfigNodeAddDialogProvider({ children }: { children: ReactNode }) {
  const [handle] = useState(() => Dialog.createHandle());

  return <ConfigNodeAddDialogContext value={handle}>{children}</ConfigNodeAddDialogContext>;
}
