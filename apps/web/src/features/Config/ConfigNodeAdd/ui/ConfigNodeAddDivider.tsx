import { useTranslation } from 'react-i18next';

import { Separator } from '@shared/ui';

import { CONFIG_NODE_ADD_NS } from '../i18n/ConfigNodeAdd.namespace.generated';

export function ConfigNodeAddDivider() {
  const { t } = useTranslation(CONFIG_NODE_ADD_NS);

  return (
    <div className='flex items-center gap-3 text-xs text-muted-foreground'>
      <Separator className='flex-1' />
      {t('manual')}
      <Separator className='flex-1' />
    </div>
  );
}
