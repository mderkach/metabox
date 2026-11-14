import type { ParseKeys } from 'i18next';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

/** What a condition field says under itself: the input hint or the error in its place, then the field's own helper. */
export function RuleConditionHint({
  id,
  error,
  helper: Helper,
}: {
  id: string;
  error: ParseKeys<'features/Rule/RuleEdit'> | undefined;
  helper: ComponentType | undefined;
}) {
  const { t } = useTranslation('features/Rule/RuleEdit');

  return (
    <>
      {error === undefined ? (
        <p id={id} className='text-xs text-muted-foreground'>
          {t('field.conditions.hint')}
        </p>
      ) : (
        <p id={id} role='alert' className='text-xs text-destructive'>
          {t(error)}
        </p>
      )}
      {Helper !== undefined && <Helper />}
    </>
  );
}
