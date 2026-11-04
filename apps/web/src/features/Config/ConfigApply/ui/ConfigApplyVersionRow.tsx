import { useTranslation } from 'react-i18next';

import { type ConfigVersion } from '@entities/Config';
import { formatBytes } from '@shared/lib/format';
import { Badge, Button } from '@shared/ui';

import { ConfigApplySavedAt } from './ConfigApplySavedAt';

/** Rollback to the current version would restart the service for the same config, so it has no button. */
export function ConfigApplyVersionRow({
  version,
  disabled,
  onRestore,
}: {
  version: ConfigVersion;
  disabled: boolean;
  onRestore: (id: number) => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');
  return (
    <li className='flex items-center gap-3 border-t border-border py-2 first:border-t-0'>
      <span className='text-sm font-medium'>{t('history.version', { id: version.id })}</span>
      {version.savedAt === null ? (
        <span className='text-xs text-muted-foreground'>{t('history.unknownTime')}</span>
      ) : (
        <ConfigApplySavedAt at={version.savedAt} />
      )}
      <span className='font-mono text-xs text-muted-foreground'>{formatBytes(version.size)}</span>
      <span className='grow' />
      {version.current ? (
        <Badge variant='secondary'>{t('history.current')}</Badge>
      ) : (
        <Button
          variant='outline'
          size='sm'
          disabled={disabled}
          onClick={() => {
            onRestore(version.id);
          }}
        >
          {t('history.restore')}
        </Button>
      )}
    </li>
  );
}
