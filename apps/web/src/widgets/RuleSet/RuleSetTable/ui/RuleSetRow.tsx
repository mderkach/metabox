import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { RULE_SET_TYPE, type RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';
import { Badge, Button, Separator } from '@shared/ui';

import { RULE_SET_COLUMN } from './RuleSetColumns';
import { formatUpdateInterval } from './RuleSetInterval';
import { RuleSetRemove } from './RuleSetRemove';

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
  onEdit,
  onRemove,
}: {
  set: RuleSetRowModel;
  rowIndex: number;
  /** Без него строка правку не предлагает. */
  onEdit?: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const { providerName, kind, category } = set.source;

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
          <span>{providerName ?? t('ruleSet.ownSource', { ns: 'shared' })}</span>
          {kind !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span className='font-mono'>{kind}</span>
            </>
          )}
          {category !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span className='font-mono'>{category}</span>
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
        <UsageMark tag={set.tag} usedBy={set.usedBy} />
      </span>
      <span role='cell' className={RULE_SET_COLUMN.RowActions}>
        <Separator orientation='vertical' className='h-5' />

        {onEdit !== undefined && isEditable(set) && (
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('row.edit', { tag: set.tag })}
            onClick={() => {
              onEdit(set.index);
            }}
          >
            <Pencil />
          </Button>
        )}

        <RuleSetRemove
          tag={set.tag}
          usedBy={set.usedBy}
          onConfirm={() => {
            onRemove(set.index);
          }}
        />
      </span>
    </div>
  );
}

/**
 * Формой правится только `remote`, принятый схемой и с тегом-строкой: у
 * остальных видов другие поля, а незнакомое поле форма потеряла бы.
 */
function isEditable(set: RuleSetRowModel): boolean {
  return set.type === RULE_SET_TYPE.Remote && set.recognized && set.tag !== '';
}

/**
 * Сколько правил пользуется набором. Ноль — не ошибка и не тревога: набор
 * исправен, просто ни на что не влияет, — поэтому он помечен контуром, а не
 * тоном отказа, и цвет тут вообще не работает признаком.
 *
 * Отметка ведёт на экран правил, отобранных по этому сету: подключить набор и
 * сослаться на него из правила — два разных экрана, и следующий шаг после
 * подключения начинается отсюда. У набора без имени ссылки нет — правило на
 * него сослаться не может.
 */
function UsageMark({ tag, usedBy }: { tag: string; usedBy: number }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  const mark =
    usedBy === 0 ? (
      <Badge variant='outline' className='border-dashed text-muted-foreground'>
        {t('row.unused')}
      </Badge>
    ) : (
      <span className='text-xs text-muted-foreground tabular-nums'>{t('row.usedBy', { count: usedBy })}</span>
    );

  if (tag === '') {
    return mark;
  }

  return (
    <Link
      to='/config'
      search={{ rule_set: tag }}
      title={t('row.rules', { tag })}
      className='rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
    >
      {mark}
    </Link>
  );
}

export const RuleSetRow = memo(RuleSetRowProto);
