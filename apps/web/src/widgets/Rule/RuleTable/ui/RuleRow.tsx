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

/**
 * Кнопка выбора занимает строку целиком, оставаясь внутри своей ячейки:
 * ячейками строку разбирает скринридер, а мышью правило выбирают в любом её
 * месте, и номер — слишком мелкая цель.
 */
const SELECT_CLASS =
  'rounded-sm after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

function RuleRowProto({
  rule,
  rowIndex,
  selected,
  onSelect,
}: {
  rule: RuleRowModel;
  rowIndex: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  return (
    <div
      role='row'
      aria-rowindex={rowIndex}
      className={cn(
        RULE_COLUMN.Row,
        'border-b border-border transition-colors hover:bg-muted/40',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <span role='cell' className={cn(RULE_COLUMN.Index, 'font-mono text-xs text-muted-foreground')}>
        <button
          type='button'
          aria-pressed={selected}
          // Кнопка растянута на строку, поэтому её имя — имя строки. Одного
          // номера мало: он перекрывает содержимое, и правило звучит как
          // «Правило 4», без условия и исхода.
          aria-label={t('row.label', { index: rule.index, target: rule.target })}
          onClick={() => {
            onSelect(rule.id);
          }}
          className={SELECT_CLASS}
        >
          {rule.index}
        </button>
      </span>

      <span role='cell' className={RULE_COLUMN.Conditions}>
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
      </span>

      <span role='cell' className={RULE_COLUMN.TargetGroup}>
        <ArrowRight className={cn(RULE_COLUMN.Arrow, 'text-muted-foreground')} />

        <span
          className={cn(RULE_COLUMN.Target, 'flex flex-col truncate font-mono text-sm font-medium')}
          title={rule.target}
        >
          <span className={cn('truncate', toTargetTone(rule.targetKind, rule.target))}>{rule.target}</span>
          {rule.targetDetail !== null && (
            <span className='truncate font-sans text-xs font-normal text-muted-foreground'>{rule.targetDetail}</span>
          )}
        </span>
      </span>
    </div>
  );
}

export const RuleRow = memo(RuleRowProto);
