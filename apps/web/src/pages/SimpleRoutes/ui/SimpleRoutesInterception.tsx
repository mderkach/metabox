import { useTranslation } from 'react-i18next';

import { ACL_MODE, useDataplane } from '@entities/Dataplane';
import { Card, CardContent } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { SimpleRoutesSection } from './SimpleRoutesSection';

export function SimpleRoutesInterception({ inbounds }: { inbounds: number }) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const dataplane = useDataplane();
  const model = dataplane.data?.model;

  function interceptionStatus(): string {
    if (model === undefined) return t('interception.unknown');
    if (!model.enabled) return t('interception.disabled');
    if (model.aclMode === ACL_MODE.All) return t('interception.all');
    if (model.aclMode === ACL_MODE.Listed) return t('interception.listed');

    return t('interception.scopeUnknown');
  }

  return (
    <SimpleRoutesSection section='interception'>
      <Card size='sm'>
        <CardContent className='flex flex-col gap-1 text-sm'>
          <p className='text-pretty'>{interceptionStatus()}</p>
          <p className='text-muted-foreground'>{t('interception.inbounds', { count: inbounds })}</p>
        </CardContent>
      </Card>
    </SimpleRoutesSection>
  );
}
