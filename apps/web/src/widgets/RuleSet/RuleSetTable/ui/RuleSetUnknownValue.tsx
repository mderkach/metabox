import { useTranslation } from 'react-i18next';

/** The source does not report the value: a dash for the eye, a word for the screen reader. */
export function RuleSetUnknownValue() {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <span className='text-xs text-muted-foreground' title={t('row.unknown')}>
      <span aria-hidden='true'>—</span>
      <span className='sr-only'>{t('row.unknown')}</span>
    </span>
  );
}
