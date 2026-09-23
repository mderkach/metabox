import { Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { findProvider, RULE_SET_TYPE, type RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';
import { cn } from '@shared/lib/utils';
import { Badge, Button, Separator } from '@shared/ui';

import { RULE_SET_COLUMN } from './RuleSetColumns';
import { formatUpdateInterval } from './RuleSetInterval';

/**
 * Строка набора.
 *
 * Имя набора — первое, что читается: именно на него ссылаются правила. Ниже
 * идёт происхождение — чьему списку доверяет маршрут, — а справа то, ради чего
 * набор вообще подключали: сколько правил им пользуется.
 */
function RuleSetRowProto({
  set,
  rowIndex,
  onRemove,
}: {
  set: RuleSetRowModel;
  rowIndex: number;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const provider = findProvider(set.source.providerId);

  return (
    <div role='row' aria-rowindex={rowIndex} className={RULE_SET_COLUMN.Row}>
      <span role='cell' className={RULE_SET_COLUMN.Tag}>
        <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span className='font-mono text-sm break-all'>{set.tag === '' ? t('row.untagged') : set.tag}</span>

          {set.type !== RULE_SET_TYPE.Remote && <Badge variant='secondary'>{t(`type.${set.type}`)}</Badge>}

          {!set.recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: 'shared' })}</Badge>}
        </span>

        {set.location !== '' && (
          <span className='truncate font-mono text-xs text-muted-foreground' title={set.location}>
            {set.location}
          </span>
        )}
      </span>

      <span role='cell' className={RULE_SET_COLUMN.Source}>
        <span className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
          <span>{provider === null ? t('ruleSet.ownSource', { ns: 'shared' }) : provider.name}</span>
          {set.source.category !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span className='font-mono'>{set.source.category}</span>
            </>
          )}
          {set.updateInterval !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span>{t('row.interval', { interval: formatUpdateInterval(set.updateInterval) })}</span>
            </>
          )}
          {set.detour !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span>{t('row.detour', { detour: set.detour })}</span>
            </>
          )}
        </span>
      </span>

      <span role='cell' className={RULE_SET_COLUMN.Usage}>
        <UsageMark usedBy={set.usedBy} />
      </span>
      <span role='cell' className={RULE_SET_COLUMN.RowActions}>
        <Separator orientation='vertical' className='h-5' />

        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('row.remove', { tag: set.tag })}
          onClick={() => {
            onRemove(set.index);
          }}
        >
          <Trash2 />
        </Button>
      </span>
    </div>
  );
}

/**
 * Сколько правил пользуется набором. Ноль — не ошибка и не тревога: набор
 * исправен, просто ни на что не влияет, — поэтому он помечен контуром, а не
 * тоном отказа, и цвет тут вообще не работает признаком.
 */
function UsageMark({ usedBy }: { usedBy: number }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  if (usedBy === 0) {
    return (
      <Badge variant='outline' className='border-dashed text-muted-foreground'>
        {t('row.unused')}
      </Badge>
    );
  }

  return <span className={cn('text-xs text-muted-foreground tabular-nums')}>{t('row.usedBy', { count: usedBy })}</span>;
}

export const RuleSetRow = memo(RuleSetRowProto);
