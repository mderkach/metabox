import type { Table } from '@tanstack/react-table';
import { Columns3, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow } from '@entities/Connection';
import { cn } from '@shared/lib/utils';
import { Button, Checkbox, Label, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@shared/ui';

import { CONNECTION_COLUMNS_HIDDEN, toTableColumns, type ConnectionTableFeatures } from './ConnectionColumns';

/**
 * Выбор показываемых полей — управление видом, а не действие над данными,
 * поэтому стоит отдельно от действий списка.
 *
 * Кнопка несёт активное состояние, когда набор отличается от исходного: иначе
 * пропавшее поле выглядит как потеря данных, а не как собственный выбор.
 * Счётчик словом её не заменяет — на узком экране на слово нет места.
 *
 * Поле с пометкой `required` в списке есть, но выключить его нельзя: без хоста
 * и действия строка перестаёт отвечать на вопрос, ради которого экран
 * открывают. Скрытый флажок вместо запрещённого оставил бы гадать, почему
 * полей в списке меньше, чем в строке.
 */
export function ConnectionColumnPicker({ table }: { table: Table<ConnectionTableFeatures, ConnectionRow> }) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const columns = toTableColumns(table);
  const hidden = columns.filter(({ column }) => !column.getIsVisible()).length;
  const changed = hidden !== Object.keys(CONNECTION_COLUMNS_HIDDEN).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={hidden === 0 ? t('fields.label') : t('fields.hidden', { count: hidden })}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              changed && 'bg-selected text-foreground ring-1 ring-selected-edge'
            )}
          />
        }
      >
        <Columns3 />
      </PopoverTrigger>

      <PopoverContent className='w-56'>
        <div className='flex items-baseline justify-between gap-2'>
          <PopoverTitle>{t('fields.title')}</PopoverTitle>
          {changed && (
            <Button
              variant='ghost'
              size='xs'
              className='text-muted-foreground hover:text-foreground'
              onClick={() => {
                table.setColumnVisibility(CONNECTION_COLUMNS_HIDDEN);
              }}
            >
              <RotateCcw />
              {t('fields.reset')}
            </Button>
          )}
        </div>

        <ul className='mt-2 flex flex-col gap-2'>
          {columns.map(({ def, column }) => {
            const id = `connection-field-${def.id}`;

            return (
              <li key={def.id} className='flex items-center gap-2'>
                <Checkbox
                  id={id}
                  checked={column.getIsVisible()}
                  disabled={def.meta.required}
                  onCheckedChange={() => {
                    column.toggleVisibility();
                  }}
                />
                <Label htmlFor={id} className='text-sm font-normal'>
                  {t(def.meta.label)}
                </Label>
                {def.meta.required && (
                  <span className='ml-auto text-2xs text-muted-foreground'>{t('fields.always')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
