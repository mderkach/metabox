import { useTranslation } from 'react-i18next';

import { useConfirmWindow } from '@entities/Daemon';
import { SECONDS_IN_MINUTE } from '@shared/lib/time';
import { DialogDescription } from '@shared/ui';

/** The confirmation window comes from the daemon flag; whole minutes are named in minutes. */
export function ConfigApplyDiffDescription() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const seconds = useConfirmWindow();

  if (seconds === null) {
    return <DialogDescription>{t('diff.description')}</DialogDescription>;
  }

  const duration =
    seconds % SECONDS_IN_MINUTE === 0
      ? t('diff.window.minute', { count: seconds / SECONDS_IN_MINUTE })
      : t('diff.window.second', { count: seconds });

  return <DialogDescription>{t('diff.descriptionWindow', { window: duration })}</DialogDescription>;
}
