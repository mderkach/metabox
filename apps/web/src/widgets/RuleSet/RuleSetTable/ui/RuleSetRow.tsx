import { Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { findProvider, RULE_SET_TYPE, type RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';
import { cn } from '@shared/lib/utils';
import { Badge, Button } from '@shared/ui';

/**
 * Строка набора.
 *
 * Имя набора — первое, что читается: именно на него ссылаются правила. Ниже
 * идёт происхождение — чьему списку доверяет маршрут, — а справа то, ради чего
 * набор вообще подключали: сколько правил им пользуется.
 */
function RuleSetRowProto({ set, onRemove }: { set: RuleSetRowModel; onRemove: (index: number) => void }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const provider = findProvider(set.source.providerId);

  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0'>
      <div className='flex min-w-0 grow flex-col gap-1'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span className='font-mono text-sm break-all'>{set.tag === '' ? t('row.untagged') : set.tag}</span>

          {set.type !== RULE_SET_TYPE.Remote && <Badge variant='secondary'>{t(`type.${set.type}`)}</Badge>}

          {!set.recognized && <Badge variant='outline'>{t('row.uncovered')}</Badge>}
        </div>

        <p className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground'>
          <span>{provider === null ? t('row.ownSource') : provider.name}</span>
          {set.source.category !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span className='font-mono'>{set.source.category}</span>
            </>
          )}
          {set.updateInterval !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span>{t('row.interval', { interval: set.updateInterval })}</span>
            </>
          )}
          {set.detour !== null && (
            <>
              <span aria-hidden='true'>·</span>
              <span>{t('row.detour', { detour: set.detour })}</span>
            </>
          )}
        </p>

        {set.location !== '' && (
          <p className='truncate font-mono text-2xs text-muted-foreground/80' title={set.location}>
            {set.location}
          </p>
        )}
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        <UsageMark usedBy={set.usedBy} />

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
      </div>
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
