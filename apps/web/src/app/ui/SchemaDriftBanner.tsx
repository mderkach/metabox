import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { matchesSchemaVersion, SCHEMA_VERSION, useServiceState } from '@entities/Daemon';

/**
 * Полоса расхождения версии sing-box на устройстве со схемой форм. Живёт в
 * оболочке, а не на карточке службы: расхождение бьёт по формам редактора, и
 * пользователь должен увидеть его на любом экране, а не только на Обзоре.
 */
export function SchemaDriftBanner() {
  const { t } = useTranslation('app');
  const service = useServiceState();
  const binary = service.data?.binary;

  if (matchesSchemaVersion(binary)) {
    return null;
  }

  return (
    <div role='status' className='shrink-0 border-b border-signal-warn/20 bg-signal-warn/10 px-4 py-2.5 sm:px-6'>
      <div className='flex min-h-7 items-center gap-2.5 text-sm text-signal-warn'>
        <TriangleAlert className='size-4 shrink-0' />
        <p>{t('banner.drift', { schema: SCHEMA_VERSION, binary })}</p>
      </div>
    </div>
  );
}
