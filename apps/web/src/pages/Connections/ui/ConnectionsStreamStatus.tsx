import { useTranslation } from 'react-i18next';

import { MS_IN_SECOND } from '@shared/lib/time';

/** Секундный интервал — умолчание, и число в нём читается хуже слова: «каждую секунду», а не «каждую 1 секунду». */
export function ConnectionsStreamStatus({ paused, interval }: { paused: boolean; interval: number }) {
  const { t } = useTranslation('pages/Connections');

  if (paused) {
    return <p className='text-xs text-muted-foreground'>{t('stream.paused')}</p>;
  }

  const seconds = interval / MS_IN_SECOND;

  return (
    <p className='text-xs text-muted-foreground'>
      {seconds === 1 ? t('stream.everySecond') : t('stream.live', { count: seconds })}
    </p>
  );
}
