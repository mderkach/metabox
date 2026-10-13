import { useTranslation } from 'react-i18next';

/** Pause changes the meaning of the screen: rows stand although traffic flows. A live stream needs no label. */
export function ConnectionsStreamStatus({ paused }: { paused: boolean }) {
  const { t } = useTranslation('pages/Connections');

  if (!paused) {
    return null;
  }

  return <p className='text-xs text-muted-foreground'>{t('stream.paused')}</p>;
}
