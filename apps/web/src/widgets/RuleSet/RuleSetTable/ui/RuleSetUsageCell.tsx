import type { RuleSetLinks } from '../model/RuleSetTable.links';
import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUsageMark } from './RuleSetUsageMark';

export function RuleSetUsageCell({ set, byTag }: RuleSetCellProps & Pick<RuleSetLinks, 'byTag'>) {
  return <RuleSetUsageMark byTag={byTag} tag={set.tag} usedBy={set.usedBy} />;
}
