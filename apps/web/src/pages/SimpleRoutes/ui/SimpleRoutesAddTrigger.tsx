import { Plus } from 'lucide-react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, DialogTrigger } from '@shared/ui';

export function SimpleRoutesAddTrigger({ primary = false, ref }: { primary?: boolean; ref?: Ref<HTMLButtonElement> }) {
  const { t } = useTranslation('pages/SimpleRoutes');

  return (
    <DialogTrigger ref={ref} render={<Button size='sm' variant={primary ? 'default' : 'outline'} />}>
      <Plus data-icon='inline-start' />
      {t('addServer.action')}
    </DialogTrigger>
  );
}
