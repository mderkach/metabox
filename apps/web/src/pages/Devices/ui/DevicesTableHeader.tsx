import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { DEVICES_NS } from '../i18n/Devices.namespace.generated';
import { DEVICES_COLUMN } from './DevicesColumns';

/** Below md the row folds into a card: the header remains for the screen reader only. */
export function DevicesTableHeader() {
  const { t } = useTranslation(DEVICES_NS);

  return (
    <div role='rowgroup'>
      <div
        role='row'
        aria-rowindex={1}
        className={cn(DEVICES_COLUMN.Row, 'bg-table-head py-2 max-md:sr-only', TABLE_HEADER)}
      >
        <span role='columnheader' className={DEVICES_COLUMN.Label}>
          {t('column.label')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Ip}>
          {t('column.ip')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Mac}>
          {t('column.mac')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Lease}>
          {t('column.lease')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Online}>
          {t('column.online')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Route}>
          {t('column.route')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.RowActions}>
          <span className='sr-only'>{t('list.rowActions', { ns: SHARED_NS })}</span>
        </span>
      </div>
    </div>
  );
}
