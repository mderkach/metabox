import { ChevronDown, ChevronUp, Columns3, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, Checkbox, Label, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@shared/ui';

import type { ConnectionView } from '../lib';
import { CONNECTION_COLUMNS, CONNECTION_COLUMNS_HIDDEN, toOrderedColumns } from './ConnectionColumns';

/** Куда сдвигается колонка: на одну позицию назад или вперёд. */
const MOVE = {
  Up: -1,
  Down: 1,
} as const;

type Move = (typeof MOVE)[keyof typeof MOVE];

function toMoveButtonId(field: string, move: Move): string {
  return `connection-field-${field}-${move === MOVE.Up ? 'up' : 'down'}`;
}

/**
 * Выбор показываемых полей — управление видом, а не действие над данными,
 * поэтому стоит отдельно от действий списка.
 *
 * Кнопка несёт активное состояние, когда набор или порядок отличается от
 * исходного: иначе пропавшее поле выглядит как потеря данных, а не как
 * собственный выбор. Счётчик словом её не заменяет — на узком экране на слово
 * нет места.
 *
 * Поле с пометкой `required` в списке есть, но выключить его нельзя: без хоста
 * и действия строка перестаёт отвечать на вопрос, ради которого экран
 * открывают. Скрытый флажок вместо запрещённого оставил бы гадать, почему
 * полей в списке меньше, чем в строке.
 *
 * Порядок меняется кнопками «выше» и «ниже», а не перетаскиванием: кнопки
 * доступны с клавиатуры и скринридеру без отдельного протокола. Фокус после
 * перестановки остаётся на кнопке переставленного поля — иначе он теряется
 * вместе с переехавшим узлом списка.
 *
 * Выбор работает с видом, а не с моделью таблицы: тулбар один на обе вкладки
 * соединений, а модель у каждой своя.
 */
export function ConnectionColumnPicker({
  view,
}: {
  view: Pick<ConnectionView, 'columns' | 'order' | 'setColumns' | 'setOrder'>;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const columns = toOrderedColumns(view.order);
  const hidden = columns.filter((def) => view.columns[def.id] === false).length;
  const reordered = columns.some((def, index) => def.id !== CONNECTION_COLUMNS[index].id);
  const changed = hidden !== Object.keys(CONNECTION_COLUMNS_HIDDEN).length || reordered;
  const focusAfterMove = useRef<string | null>(null);

  useEffect(
    function focusMovedField() {
      if (focusAfterMove.current === null) {
        return;
      }

      document.getElementById(focusAfterMove.current)?.focus();
      focusAfterMove.current = null;
    },
    [view.order]
  );

  function move(index: number, step: Move) {
    const ids = columns.map((def) => def.id);
    const target = index + step;
    const [field] = ids.splice(index, 1);

    ids.splice(target, 0, field);
    // На краю списка кнопка того же направления гаснет, и фокус уходит на соседнюю.
    const atEdge = target === 0 || target === ids.length - 1;
    const back = step === MOVE.Up ? MOVE.Down : MOVE.Up;

    focusAfterMove.current = toMoveButtonId(field, atEdge ? back : step);
    view.setOrder(ids);
  }

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

      <PopoverContent className='w-64'>
        <div className='flex items-baseline justify-between gap-2'>
          <PopoverTitle>{t('fields.title')}</PopoverTitle>
          {changed && (
            <Button
              variant='ghost'
              size='xs'
              className='text-muted-foreground hover:text-foreground'
              onClick={() => {
                view.setColumns(CONNECTION_COLUMNS_HIDDEN);
                view.setOrder([]);
              }}
            >
              <RotateCcw />
              {t('fields.reset')}
            </Button>
          )}
        </div>

        <ul className='mt-2 flex flex-col gap-2'>
          {columns.map((def, index) => {
            const id = `connection-field-${def.id}`;
            const label = t(def.meta.label);
            const visible = view.columns[def.id] !== false;

            return (
              <li key={def.id} className='flex items-center gap-2'>
                <Checkbox
                  id={id}
                  checked={visible}
                  disabled={def.meta.required}
                  onCheckedChange={() => {
                    view.setColumns((current) => ({ ...current, [def.id]: !visible }));
                  }}
                />
                <Label htmlFor={id} className='text-sm font-normal'>
                  {label}
                </Label>
                {def.meta.required && <span className='text-2xs text-muted-foreground'>{t('fields.always')}</span>}
                <span className='ml-auto flex'>
                  <Button
                    id={toMoveButtonId(def.id, MOVE.Up)}
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('fields.moveUp', { column: label })}
                    disabled={index === 0}
                    onClick={() => {
                      move(index, MOVE.Up);
                    }}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    id={toMoveButtonId(def.id, MOVE.Down)}
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('fields.moveDown', { column: label })}
                    disabled={index === columns.length - 1}
                    onClick={() => {
                      move(index, MOVE.Down);
                    }}
                  >
                    <ChevronDown />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
