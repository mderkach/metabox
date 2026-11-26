import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { PROXY_GROUPS_NS } from '../i18n/ProxyGroups.namespace.generated';

import layout from './ProxyNodeLayout.module.css';

export function ProxyNormHeading() {
  const { t } = useTranslation(PROXY_GROUPS_NS);

  return (
    <div
      className={cn(
        layout.heading,
        'border-b py-2 text-xs font-medium tracking-wide text-muted-foreground min-[901px]:uppercase'
      )}
    >
      <span className={cn(layout.identity, 'hidden ps-7 min-[901px]:block')}>{t('metadata.serverColumn')}</span>
      <span className={cn(layout.delay, 'hidden min-[901px]:block')}>{t('metadata.currentColumn')}</span>
      <span className={cn(layout.reading, 'hidden min-[1101px]:block')}>{t('metadata.relativeToNorm')}</span>
      <span className={layout.norm}>
        {t('metadata.norm')}
        <span aria-hidden='true'> · </span>
        <span>{t('metadata.autoDefault')}</span>
      </span>
      <span className={cn(layout.status, 'hidden min-[901px]:block')}>{t('metadata.stateColumn')}</span>
    </div>
  );
}
