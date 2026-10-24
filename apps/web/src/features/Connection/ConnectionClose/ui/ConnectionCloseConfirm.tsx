import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@shared/ui';

/**
 * Confirmation before tearing one connection: it cannot be undone, and the
 * row's button sits next to a harmless one, so a miss must not close it.
 */
export function ConnectionCloseConfirm({
  host,
  open,
  onOpenChange,
  onConfirm,
}: {
  host: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('features/Connection/ConnectionClose');

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title', { host })}
      description={t('description')}
      cancelLabel={t('action.cancel', { ns: 'shared' })}
      confirmLabel={t('confirm')}
      destructive
      onConfirm={onConfirm}
    />
  );
}
