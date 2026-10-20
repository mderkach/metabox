import { useTranslation } from 'react-i18next';

import { Separator } from '@shared/ui';

export function ConfigNodeAddDivider() {
  const { t } = useTranslation('features/Config/ConfigNodeAdd');

  return (
    <div className='flex items-center gap-3 text-xs text-muted-foreground'>
      <Separator className='flex-1' />
      {t('manual')}
      <Separator className='flex-1' />
    </div>
  );
}
