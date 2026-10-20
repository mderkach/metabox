import { useTranslation } from 'react-i18next';

import { toActionText } from '@entities/Connection';
import { isNamedRuleAction } from '@entities/Rule';
import { cn } from '@shared/lib/utils';

import { toActionTone } from './ConnectionAction';
import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionActionCell({ connection }: ConnectionCellProps) {
  const { t } = useTranslation('shared');
  const action = toActionText(
    connection.action,
    (outbound) => t('route.via', { outbound }),
    (name) => (isNamedRuleAction(name) ? t(`ruleAction.${name}`) : null)
  );

  return (
    <span className={cn('block truncate text-xs font-medium', toActionTone(connection.kind))} title={connection.action}>
      {action}
    </span>
  );
}
