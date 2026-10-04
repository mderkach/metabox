import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { WorkdirMismatch } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/**
 * Рабочий каталог службы задаёт UCI-опция `workdir` пакета sing-box для
 * OpenWrt: init-скрипт передаёт её флагом `-D`. Без рестарта procd держит
 * прежнюю команду, и повторное применение упёрлось бы в тот же отказ.
 */
const UCI_WORKDIR = 'sing-box.main.workdir';
const UCI_COMMIT = 'uci commit sing-box && /etc/init.d/sing-box restart';

/** Команда собирается из каталога, который назвал демон: панель путь конфига не выдумывает. */
export function ConfigApplyWorkdir({ mismatch }: { mismatch: WorkdirMismatch }) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{t('workdir.title')}</AlertTitle>
      <AlertDescription>
        <p>{t('workdir.description', { workdir: mismatch.workdir, configDir: mismatch.configDir })}</p>
        <pre className='font-mono text-xs whitespace-pre-wrap'>
          {`uci set ${UCI_WORKDIR}=${mismatch.configDir} && ${UCI_COMMIT}`}
        </pre>
        <p className='text-xs'>{t('workdir.sideEffect')}</p>
      </AlertDescription>
    </Alert>
  );
}
