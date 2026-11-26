import { Trans, useTranslation } from 'react-i18next';

import { EDITOR_NS } from '../i18n/Editor.namespace.generated';

export function EditorOrderHint() {
  const { t } = useTranslation(EDITOR_NS);

  return (
    <div className='flex items-center gap-1 text-sm text-muted-foreground'>
      <p className='text-pretty'>
        <Trans t={t} i18nKey='order.short' components={{ accent: <span className='font-medium text-foreground' /> }} />
      </p>
    </div>
  );
}
