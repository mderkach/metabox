import { useTranslation } from 'react-i18next';

import { RULE_CHANGE, type RuleChange } from '@entities/Rule';

import { useRuleChanges } from '../lib/ConfigApply.lib';

/** Строк сводки до «и ещё N»: дальше подробности читаются в самом дифе. */
const SHOWN_CHANGES = 5;

const CHANGE_TEXT = {
  [RULE_CHANGE.Added]: 'diff.rules.added',
  [RULE_CHANGE.Removed]: 'diff.rules.removed',
  [RULE_CHANGE.Changed]: 'diff.rules.changed',
  [RULE_CHANGE.Target]: 'diff.rules.target',
  [RULE_CHANGE.Moved]: 'diff.rules.moved',
} as const satisfies Record<RuleChange['kind'], string>;

export function ConfigApplyRuleChanges() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const changes = useRuleChanges();

  if (changes.length === 0) return null;

  const rest = changes.length - SHOWN_CHANGES;

  return (
    <ul aria-label={t('diff.rules.label')} className='flex flex-col gap-0.5 text-sm'>
      {changes.slice(0, SHOWN_CHANGES).map((change) => (
        <li key={`${change.kind}:${String(change.index)}`}>{t(CHANGE_TEXT[change.kind], change)}</li>
      ))}
      {rest > 0 && <li className='text-muted-foreground'>{t('diff.rules.more', { count: rest })}</li>}
    </ul>
  );
}
