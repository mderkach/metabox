import { useTranslation } from 'react-i18next';

import { NS } from './ConfigNodeForm.namespace';

export function ConfigNodeFormGroupCount({ filled, total }: { filled: number; total: number }) {
  const { t } = useTranslation(NS);

  return (
    <span aria-hidden='true' className='text-xs font-normal text-muted-foreground tabular-nums'>
      {t('group.filled', { count: filled, total })}
    </span>
  );
}
