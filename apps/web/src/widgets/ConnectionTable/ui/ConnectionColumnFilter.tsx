import type { Column } from '@tanstack/react-table';
import { ListFilter, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow } from '@entities/Connection';
import { cn } from '@shared/lib/utils';
import { Button, Input, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@shared/ui';

import type { ConnectionColumnDef, ConnectionTableFeatures } from './ConnectionColumns';

/**
 * Отбор по одной колонке: подстрока без учёта регистра.
 *
 * Стоит отдельным контролом рядом с сортировкой, а не внутри неё: нажатие на
 * подпись обязано переключать порядок, и фильтр, спрятанный в ту же кнопку,
 * отнимал бы у неё это.
 *
 * Поставленный фильтр виден по кнопке: без признака пустая таблица выглядит
 * поломкой, а не результатом отбора.
 */
export function ConnectionColumnFilter({
  def,
  column,
}: {
  def: ConnectionColumnDef;
  column: Column<ConnectionTableFeatures, ConnectionRow>;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const value = column.getFilterValue();
  const text = typeof value === 'string' ? value : '';
  const name = t(def.meta.label);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='icon-xs'
            aria-label={text.length === 0 ? t('filter.label', { column: name }) : t('filter.active', { column: name })}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              text.length > 0 && 'bg-selected text-foreground ring-1 ring-selected-edge'
            )}
          />
        }
      >
        <ListFilter />
      </PopoverTrigger>

      <PopoverContent className='w-56'>
        <div className='flex items-baseline justify-between gap-2'>
          <PopoverTitle>{t('filter.title', { column: name })}</PopoverTitle>
          {text.length > 0 && (
            <Button
              variant='ghost'
              size='xs'
              className='text-muted-foreground hover:text-foreground'
              onClick={() => {
                column.setFilterValue('');
              }}
            >
              <RotateCcw />
              {t('filter.clear')}
            </Button>
          )}
        </div>

        <Input
          value={text}
          onChange={(event) => {
            column.setFilterValue(event.target.value);
          }}
          placeholder={t('filter.placeholder')}
          aria-label={t('filter.input', { column: name })}
        />
      </PopoverContent>
    </Popover>
  );
}
