import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { DEVICES_COLUMN } from './DevicesColumns';

/** Ниже md строка складывается карточкой: шапка остаётся только для скринридера. */
export function DevicesTableHeader() {
  const { t } = useTranslation('pages/Devices');

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
        <span role='columnheader' className={DEVICES_COLUMN.NameSource}>
          {t('column.nameSource')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Lease}>
          {t('column.lease')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.Online}>
          {t('column.online')}
        </span>
        <span role='columnheader' className={DEVICES_COLUMN.RowActions}>
          <span className='sr-only'>{t('list.rowActions', { ns: 'shared' })}</span>
        </span>
      </div>
    </div>
  );
}
