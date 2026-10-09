import { useTranslation } from 'react-i18next';

/** Пауза меняет смысл экрана: строки стоят, хотя трафик идёт. Живой поток в подписи не нуждается. */
export function ConnectionsStreamStatus({ paused }: { paused: boolean }) {
  const { t } = useTranslation('pages/Connections');

  if (!paused) {
    return null;
  }

  return <p className='text-xs text-muted-foreground'>{t('stream.paused')}</p>;
}
