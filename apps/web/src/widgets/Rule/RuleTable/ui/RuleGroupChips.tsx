import { memo } from 'react';

import type { RuleBranch, RuleGroup } from '@entities/Rule';

import { RuleMatcherChip } from './RuleMatcherChip';

const MODE_LABEL: Readonly<Record<string, string>> = {
  and: 'и',
  or: 'или',
};

/**
 * Условия логического правила. Показываются скобками с союзом между ветками:
 * без них правило `or` читается как `and`, а это разные правила.
 */
function RuleGroupChipsProto({ group }: { group: RuleGroup }) {
  const label = MODE_LABEL[group.mode] ?? group.mode;

  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      {group.invert && <span className='shrink-0 text-xs text-muted-foreground'>кроме</span>}
      <span className='shrink-0 text-xs text-muted-foreground'>(</span>
      {group.children.map((branch, position) => (
        <BranchChips
          // Собственного идентификатора у вложенного правила нет, порядок задан конфигом.
          key={position}
          branch={branch}
          separator={position > 0 ? label : null}
        />
      ))}
      <span className='shrink-0 text-xs text-muted-foreground'>)</span>
    </span>
  );
}

function BranchChips({ branch, separator }: { branch: RuleBranch; separator: string | null }) {
  return (
    <>
      {separator !== null && <span className='shrink-0 text-xs text-muted-foreground'>{separator}</span>}
      {branch.matchers.map((matcher) => (
        <RuleMatcherChip key={matcher.key} matcher={matcher} />
      ))}
      {branch.group !== null && <RuleGroupChips group={branch.group} />}
    </>
  );
}

export const RuleGroupChips = memo(RuleGroupChipsProto);
