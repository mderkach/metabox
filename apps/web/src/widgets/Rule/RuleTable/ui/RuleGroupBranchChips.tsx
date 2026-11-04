import type { ReactNode } from 'react';

import type { RuleBranch } from '@entities/Rule';

import { RuleMatcherChip } from './RuleMatcherChip';

export function RuleGroupBranchChips({
  branch,
  separator,
  nested,
}: {
  branch: RuleBranch;
  separator: string | null;
  nested: ReactNode;
}) {
  return (
    <>
      {separator !== null && <span className='shrink-0 text-xs text-muted-foreground'>{separator}</span>}
      {branch.matchers.map((matcher) => (
        <RuleMatcherChip key={matcher.key} matcher={matcher} />
      ))}
      {nested}
    </>
  );
}
