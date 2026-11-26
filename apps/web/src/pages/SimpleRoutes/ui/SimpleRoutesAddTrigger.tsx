import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigNodeAddDialogTrigger } from '@features/Config/ConfigNodeAdd';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';

export function SimpleRoutesAddTrigger({ primary = false, ref }: { primary?: boolean; ref?: Ref<HTMLButtonElement> }) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);

  return <ConfigNodeAddDialogTrigger label={t('addServer.action')} primary={primary} ref={ref} />;
}
