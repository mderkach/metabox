import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device';

export function RouteExplanationTitle({ host, source }: { host: string; source: string }) {
  const { t } = useTranslation('widgets/RouteExplanation');
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
