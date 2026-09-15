import { ArrowRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleRow as RuleRowModel } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { Badge } from '@shared/ui';

import { RULE_COLUMN } from './RuleColumns';
import { RuleGroupChips } from './RuleGroupChips';
import { RuleMatcherChip } from './RuleMatcherChip';
import { toTargetTone } from './RuleTargetTone';

function RuleRowProto({
  rule,
  selected,
  onSelect,
}: {
  rule: RuleRowModel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('widgets/Rule/RuleTable');
  return (
    <button
      type='button'
      aria-pressed={selected}
      aria-label={t('row.label', { index: rule.index })}
      onClick={() => {
        onSelect(rule.id);
      }}
      className={cn(
        RULE_COLUMN.Row,
        'w-full border-b border-border text-left transition-colors hover:bg-muted/40',
        'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:-outline-offset-2 focus-visible:outline-none',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <span className={RULE_COLUMN.Index}>{rule.index}</span>

      <div className='flex min-w-0 grow flex-wrap items-center gap-1.5'>
        {/* Нераспознанный узел «без условий» не бывает: условие в нём есть,
            просто схема не знает его поля и показать его нечем. */}
        {rule.isCatchAll &&
          (rule.recognized ? (
            <span className='text-sm text-muted-foreground'>{t('row.unconditional')}</span>
          ) : (
            <span className='text-sm text-muted-foreground'>{t('row.unknown')}</span>
          ))}

        {!rule.recognized && (
          <Badge variant='outline' className='shrink-0'>
            {t('row.uncovered')}
          </Badge>
        )}

        {rule.invert && rule.group === null && (
          <span className='shrink-0 text-xs text-muted-foreground'>{t('group.invert')}</span>
        )}

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
          <span className={cn('truncate', toTargetTone(rule.targetKind, rule.target))}>{rule.target}</span>
          {rule.targetDetail !== null && (
            <span className='truncate font-sans text-xs font-normal text-muted-foreground'>{rule.targetDetail}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export const RuleRow = memo(RuleRowProto);
