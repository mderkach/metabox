import { useTranslation } from 'react-i18next';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';

/** The source does not report the value: a dash for the eye, a word for the screen reader. */
export function RuleSetUnknownValue() {
  const { t } = useTranslation(RULE_SET_TABLE_NS);

  return (
    <span className='text-xs text-muted-foreground' title={t('row.unknown')}>
      <span aria-hidden='true'>—</span>
      <span className='sr-only'>{t('row.unknown')}</span>
    </span>
  );
}
