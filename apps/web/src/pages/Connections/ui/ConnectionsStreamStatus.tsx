import { useTranslation } from 'react-i18next';

/**
 * Pause and a dropped stream change the meaning of the screen: rows and speeds
 * stand although traffic flows. A live stream needs no label.
 */
export function ConnectionsStreamStatus({ paused, stale }: { paused: boolean; stale: boolean }) {
  const { t } = useTranslation('pages/Connections');

  if (paused) {
    return <p className='text-xs text-muted-foreground'>{t('stream.paused')}</p>;
  }

  if (stale) {
    return (
      <p role='status' className='text-xs text-signal-warn'>
        {t('stream.stale')}
      </p>
    );
  }

  return null;
}
