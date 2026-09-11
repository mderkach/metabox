import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

import type { RuleRow as RuleRowModel } from '@entities/Rule';
import { cn } from '@shared/lib/utils';

import { RULE_COLUMN } from './RuleColumns';
import { RuleGroupChips } from './RuleGroupChips';
import { RuleMatcherChip } from './RuleMatcherChip';

function RuleRowProto({
  rule,
  selected,
  onSelect,
}: {
  rule: RuleRowModel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type='button'
      aria-pressed={selected}
      aria-label={`Правило ${String(rule.index)}`}
      onClick={() => {
        onSelect(rule.id);
      }}
      className={cn(
        RULE_COLUMN.Row,
        'w-full border-b border-border text-left hover:bg-muted/50',
        selected && 'bg-muted/60'
      )}
    >
      <span className={RULE_COLUMN.Index}>{rule.index}</span>

      <div className='flex min-w-0 grow flex-wrap items-center gap-1.5'>
        {rule.isCatchAll && (
          <span className='text-sm text-muted-foreground'>без условий — применяется ко всему трафику</span>
        )}

        {rule.invert && rule.group === null && <span className='shrink-0 text-xs text-muted-foreground'>кроме</span>}

        {rule.matchers.map((matcher) => (
          <RuleMatcherChip key={matcher.key} matcher={matcher} />
        ))}

        {rule.group !== null && <RuleGroupChips group={rule.group} />}
      </div>

      {/* Стрелка и исход переносятся вместе: оторванная от исхода стрелка
          читается как часть условия. */}
      <span className='flex shrink-0 items-center gap-3'>
        <ArrowRight className='size-4 shrink-0 text-muted-foreground' />

        <span className={cn(RULE_COLUMN.Target, 'flex flex-col')} title={rule.target}>
          <span className='truncate'>{rule.target}</span>
          {rule.targetDetail !== null && (
            <span className='truncate font-sans text-xs font-normal text-muted-foreground'>{rule.targetDetail}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export const RuleRow = memo(RuleRowProto);
