import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Button, ConfirmDialog, DialogFooter } from '@shared/ui';

type McpKey = ParseKeys<'features/Mcp/McpAccess'>;

const PERMISSION_KEY: Readonly<Record<string, McpKey | undefined>> = {
  read: 'permission.read',
};

export function McpAccessOn({
  url,
  permissions,
  pending,
  onRegenerate,
  onDisable,
}: {
  url: string;
  permissions: readonly string[];
  pending: boolean;
  onRegenerate: () => void;
  onDisable: () => void;
}) {
  const { t } = useTranslation('features/Mcp/McpAccess');
  const permissionTexts = permissions.map((permission) => {
    const key = PERMISSION_KEY[permission];

    return key === undefined ? permission : t(key);
  });

  return (
    <div className='flex flex-col gap-3'>
      <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm'>
        <dt className='text-muted-foreground'>{t('on.state')}</dt>
        <dd>{t('on.enabled')}</dd>
        <dt className='text-muted-foreground'>{t('on.url')}</dt>
        <dd className='font-mono text-xs break-all'>{url}</dd>
        <dt className='text-muted-foreground'>{t('on.permissions')}</dt>
        <dd>{permissionTexts.join(', ')}</dd>
      </dl>

      <DialogFooter>
        <ConfirmDialog
          trigger={
            <Button type='button' variant='outline' disabled={pending}>
              {t('on.disable.action')}
            </Button>
          }
          title={t('on.disable.title')}
          description={t('on.disable.description')}
          cancelLabel={t('action.cancel', { ns: 'shared' })}
          confirmLabel={t('on.disable.confirm')}
          destructive
          onConfirm={onDisable}
        />
        <ConfirmDialog
          trigger={
            <Button type='button' disabled={pending}>
              {t('on.regenerate.action')}
            </Button>
          }
          title={t('on.regenerate.title')}
          description={t('on.regenerate.description')}
          cancelLabel={t('action.cancel', { ns: 'shared' })}
          confirmLabel={t('on.regenerate.confirm')}
          destructive
          onConfirm={onRegenerate}
        />
      </DialogFooter>
    </div>
  );
}
