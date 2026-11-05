import { useTranslation } from 'react-i18next';

import type { ProviderUpdate } from '@entities/Proxy';
import { formatAge, formatDateTime } from '@shared/lib/format';
import { MS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

export function ProxiesProviderUpdatedAt({ update, now }: { update: ProviderUpdate; now: number }) {
  const { t } = useTranslation('pages/Proxies');

  if (update.kind === 'never') {
    return <span>{t('providers.neverUpdated')}</span>;
  }

  if (update.kind === 'unknown') {
    return <span title={update.raw}>{t('providers.updatedUnknown')}</span>;
  }

  const ageSeconds = (now - update.at.getTime()) / MS_IN_SECOND;
  const label =
    ageSeconds < SECONDS_IN_MINUTE
      ? t('providers.updatedNow')
      : t('providers.updatedAgo', { age: formatAge(ageSeconds) });

  return (
    <time dateTime={update.raw} title={formatDateTime(update.at)}>
      {label}
    </time>
  );
}
