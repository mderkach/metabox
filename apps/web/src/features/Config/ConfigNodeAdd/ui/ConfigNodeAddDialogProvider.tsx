import { Dialog } from '@base-ui/react/dialog';
import { useMemo, useState, type ReactNode } from 'react';

import { ConfigNodeAddDialogContext } from './ConfigNodeAddDialog.context';

export function ConfigNodeAddDialogProvider({ children }: { children: ReactNode }) {
  const [handle] = useState(() => Dialog.createHandle());
  const [ready, setReady] = useState(false);
  const dialog = useMemo(() => ({ handle, ready, setReady }), [handle, ready]);

  return <ConfigNodeAddDialogContext value={dialog}>{children}</ConfigNodeAddDialogContext>;
}
