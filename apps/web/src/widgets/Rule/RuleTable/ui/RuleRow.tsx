import { ArrowRight } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleRow as RuleRowModel } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@shared/ui';

import { RULE_HIT, type RuleHitCell } from '../model';
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

/** Выход обрезан: строка выхода или его параметров шире своей ячейки. */
function isTruncated(target: HTMLElement | null): boolean {
  return target !== null && [...target.children].some((line) => line.scrollWidth > line.clientWidth);
}

function RuleRowProto({
  rule,
  rowIndex,
  selected,
  edited,
  hits,
  outboundTypes,
  onSelect,
}: {
  rule: RuleRowModel;
  rowIndex: number;
  selected: boolean;
  /** Правила нет в применённом конфиге: оно новое или изменено в черновике. */
  edited: boolean;
  /** `undefined` — колонки нет. */
  hits: RuleHitCell | undefined;
  /** Тип аутбаунда по тегу: по нему красится выход. */
  outboundTypes: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('widgets/Rule/RuleTable');
  const label = t('row.label', { index: rule.index, target: rule.target });
  const targetRef = useRef<HTMLSpanElement>(null);
  const [hint, setHint] = useState(false);

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
        {/* Кнопка перекрывает строку, и `title` обрезанного выхода под ней не
            показался бы. Полный выход — подсказкой самой кнопки и только при
            обрезке: скринридеру он уже назван в имени кнопки. Подсказка идёт
            за курсором по горизонтали, потому что якорь у неё — кнопка, а
            она растянута на всю строку. */}
        <Tooltip
          open={hint}
          trackCursorAxis='x'
          onOpenChange={(open) => {
            setHint(open && isTruncated(targetRef.current));
          }}
        >
          <TooltipTrigger
            type='button'
            aria-pressed={selected}
            // Кнопка растянута на строку, поэтому её имя — имя строки. Одного
            // номера мало: он перекрывает содержимое, и правило звучит как
            // «Правило 4», без условия и выхода.
            aria-label={edited ? `${label}, ${t('row.edited')}` : label}
            onClick={() => {
              onSelect(rule.id);
            }}
            className={SELECT_CLASS}
          >
            {rule.index}
          </TooltipTrigger>
          <TooltipContent>
            {rule.target}
            {rule.targetDetail !== null && <> · {rule.targetDetail}</>}
          </TooltipContent>
        </Tooltip>
        {edited && (
          <span
            aria-hidden='true'
            className='absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-primary'
          />
        )}
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
            {t('rule.uncovered', { ns: 'shared' })}
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
          ref={targetRef}
          className={cn(RULE_COLUMN.Target, 'flex flex-col truncate font-mono text-sm font-medium')}
        >
          <span className={cn('truncate', toTargetTone(rule.targetKind, rule.target, outboundTypes))}>
            {rule.target}
          </span>
          {rule.targetDetail !== null && (
            <span className='truncate font-sans text-xs font-normal text-muted-foreground'>{rule.targetDetail}</span>
          )}
        </span>
      </span>

      {hits !== undefined && (
        <span role='cell' className={cn(RULE_COLUMN.Hits, 'font-mono text-xs text-muted-foreground tabular-nums')}>
          <RuleHitValue hits={hits} language={i18n.language} />
        </span>
      )}
    </div>
  );
}

export const RuleRow = memo(RuleRowProto);

function RuleHitValue({ hits, language }: { hits: RuleHitCell; language: string }) {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  if (hits === RULE_HIT.Edited) {
    return <span aria-hidden='true'>—</span>;
  }

  if (hits === RULE_HIT.Unobserved) {
    return <span>{t('hits.unobservedCell')}</span>;
  }

  return <data value={hits}>{hits.toLocaleString(language)}</data>;
}
