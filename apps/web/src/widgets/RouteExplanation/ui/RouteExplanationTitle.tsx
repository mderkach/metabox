import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device';

import { ROUTE_EXPLANATION_NS } from '../i18n/RouteExplanation.namespace.generated';

export function RouteExplanationTitle({ host, source }: { host: string; source: string }) {
  const { t } = useTranslation(ROUTE_EXPLANATION_NS);
  const devices = useDeviceIndex();

  return (
    <>
      {t('title')}
      <span className='truncate font-mono text-xs font-normal text-muted-foreground'>{host}</span>
      {source !== '' && (
        <span className='truncate text-xs font-normal text-muted-foreground' title={source}>
          {t('from', { device: deviceLabel(source, devices) })}
        </span>
      )}
    </>
  );
}
