import { useTranslation } from 'react-i18next';

import { CONFIG_NODE_FORM_NS } from '../i18n/ConfigNodeForm.namespace.generated';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { ConfigNodeFormTextField } from './ConfigNodeFormTextField';

export function ConfigNodeFormDurationField({ field, name, children }: NodeFieldProps) {
  const { t } = useTranslation(CONFIG_NODE_FORM_NS);

  return (
    <ConfigNodeFormTextField field={field} name={name} placeholder={t('duration.placeholder')}>
      {children}
    </ConfigNodeFormTextField>
  );
}
