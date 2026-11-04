import { useTranslation } from 'react-i18next';

import type { NodeFieldProps } from './ConfigNodeForm.field';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormTextField } from './ConfigNodeFormTextField';

export function ConfigNodeFormDurationField({ field, name, children }: NodeFieldProps) {
  const { t } = useTranslation(NS);

  return (
    <ConfigNodeFormTextField field={field} name={name} placeholder={t('duration.placeholder')}>
      {children}
    </ConfigNodeFormTextField>
  );
}
