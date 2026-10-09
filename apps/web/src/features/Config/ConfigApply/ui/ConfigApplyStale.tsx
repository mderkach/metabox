import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@shared/ui';

import { ConfigApplyDiscard } from './ConfigApplyDiscard';

/**
 * Черновик начат от конфига, который на устройстве уже другой: его переписали,
 * пока черновик ждал в браузере, или применили из другой вкладки. Применение
 * затрёт то, что поменялось на устройстве, поэтому решает пользователь.
 */
export function ConfigApplyStale({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <Alert className='max-sm:pr-2.5'>
      <TriangleAlert />
      <AlertTitle>{t('stale.title')}</AlertTitle>
      <AlertDescription>{t('stale.description')}</AlertDescription>
      {/* Примитив ставит действие абсолютом в угол; на узком экране оно
          наезжает на заголовок, поэтому там уходит в поток. */}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
        <ConfigApplyDiscard label={t('stale.discard')} onDiscard={onDiscard} />
      </AlertAction>
    </Alert>
  );
}
