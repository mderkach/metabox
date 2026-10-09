import { Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SCHEMA_DRIFT, SCHEMA_VERSION, schemaDrift, useServiceState } from '@entities/Daemon';
import { Alert, AlertDescription } from '@shared/ui';

/**
 * Расхождение версии sing-box на устройстве со схемой форм. Стоит в разделе
 * конфигурации, а не над всеми экранами: расхождение касается только форм, и
 * на Обзоре или Соединениях оно перекрикивало бы то, ради чего туда пришли.
 *
 * Бинарь новее схемы — справка: формы не покажут новых полей, но ничего не
 * сломают. Бинарь старше — предупреждение: поле из формы он может отклонить.
 */
export function SchemaDriftNotice() {
  const { t } = useTranslation('app');
  const service = useServiceState();
  const binary = service.data?.binary;
  const drift = schemaDrift(binary);

  if (drift === SCHEMA_DRIFT.None) {
    return null;
  }

  return (
    <Alert>
      {drift === SCHEMA_DRIFT.Newer ? <Info /> : <TriangleAlert />}
      <AlertDescription>{t(`drift.${drift}`, { schema: SCHEMA_VERSION, binary })}</AlertDescription>
    </Alert>
  );
}
