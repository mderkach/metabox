import { useTranslation } from 'react-i18next';

import { toRuleText } from '@entities/Connection';
import { isNamedRuleMatcher } from '@entities/Rule';

import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionRuleCell({ connection }: ConnectionCellProps) {
  const { t } = useTranslation('shared');
  const rule =
    connection.rule.length > 0
      ? toRuleText(connection.rule, (key) => (isNamedRuleMatcher(key) ? t(`matcher.${key}`) : null))
      : t('rule.unconditional');

  return (
    <span className='block truncate text-xs' title={connection.rule}>
      {rule}
    </span>
  );
}
