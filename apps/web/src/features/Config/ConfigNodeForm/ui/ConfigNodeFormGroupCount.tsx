import { useTranslation } from 'react-i18next';

import { CONFIG_NODE_FORM_NS } from '../i18n/ConfigNodeForm.namespace.generated';

export function ConfigNodeFormGroupCount({ filled, total }: { filled: number; total: number }) {
  const { t } = useTranslation(CONFIG_NODE_FORM_NS);

  return (
    <span aria-hidden='true' className='text-xs font-normal text-muted-foreground tabular-nums'>
      {t('group.filled', { count: filled, total })}
    </span>
  );
}
