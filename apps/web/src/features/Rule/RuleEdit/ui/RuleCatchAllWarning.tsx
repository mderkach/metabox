import { TriangleAlert } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { conditionLines, RULE_CONDITIONS, type RuleEditModel } from '../model/RuleEdit.schema';

/** Warns, does not block: a rule without conditions is sometimes intended. */
export function RuleCatchAllWarning() {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { watch } = useFormContext<RuleEditModel>();
  const sets = watch('ruleSet');
  const conditions = watch('conditions');
  const empty = sets.length === 0 && RULE_CONDITIONS.every((key) => conditionLines(conditions[key]).length === 0);

  if (!empty) {
    return null;
  }

  return (
    <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-warn'>
      <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
      <span>{t('warning.catchAll')}</span>
    </p>
  );
}
