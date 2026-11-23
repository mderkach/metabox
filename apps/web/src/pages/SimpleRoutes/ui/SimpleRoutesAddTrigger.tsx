import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigNodeAddDialogTrigger } from '@features/Config/ConfigNodeAdd';

export function SimpleRoutesAddTrigger({ primary = false, ref }: { primary?: boolean; ref?: Ref<HTMLButtonElement> }) {
  const { t } = useTranslation('pages/SimpleRoutes');

  return <ConfigNodeAddDialogTrigger label={t('addServer.action')} primary={primary} ref={ref} />;
}
