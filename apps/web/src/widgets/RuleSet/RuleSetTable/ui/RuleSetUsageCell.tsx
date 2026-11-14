import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUsageMark } from './RuleSetUsageMark';

export function RuleSetUsageCell({ set }: RuleSetCellProps) {
  return <RuleSetUsageMark tag={set.tag} usedBy={set.usedBy} />;
}
