import { Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCloseConnection } from '@features/Connection/ConnectionClose';
import { Button } from '@shared/ui';

/** Closes the explained connection from the panel: over the list the panel covers the row's own button. */
export function ConnectionsCloseExplained({ connectionId, host }: { connectionId: string; host: string }) {
  const { t } = useTranslation('pages/Connections');
  const close = useCloseConnection();

  return (
    <Button
      variant='ghost'
      size='icon-sm'
      aria-label={t('closeExplained', { host })}
      disabled={close.isPending}
      onClick={() => {
        close.mutate(connectionId);
      }}
    >
      <Unplug />
    </Button>
  );
}
