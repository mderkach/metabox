import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';
import { useState, type ComponentProps } from 'react';

import { cn } from '../lib/utils';
import { Input } from './shadcn/input';

/**
 * Поле со свободным вводом и подсказками. Значение — сам текст поля: подсказка
 * его только подставляет, и имя, которого в списке нет, остаётся допустимым
 * вводом. У shadcn такого примитива нет — его комбобокс выбирает только из
 * списка.
 *
 * Отбор делает вызывающий: `items` показываются как есть и в том же порядке.
 *
 * Без подсказок список не открывается. Открытый список Base UI прячет от
 * скринридера остальную страницу (`aria-hidden`), и пустой невидимый попап
 * заглушил бы предупреждение, которое форма показывает под полем.
 */
export function Autocomplete({
  items,
  value,
  onValueChange,
  className,
  listClassName,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange'> & {
  items: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  listClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AutocompletePrimitive.Root
      items={items}
      filter={null}
      value={value}
      onValueChange={(next) => {
        onValueChange(next);
      }}
      open={open && items.length > 0}
      onOpenChange={setOpen}
      openOnInputClick
    >
      <AutocompletePrimitive.Input render={<Input className={className} />} {...props} />
      <AutocompletePrimitive.Portal>
        <AutocompletePrimitive.Positioner sideOffset={4} align='start' className='isolate z-50'>
          <AutocompletePrimitive.Popup
            className={cn(
              'max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
              listClassName
            )}
          >
            <AutocompletePrimitive.List>
              {(item: string) => (
                <AutocompletePrimitive.Item
                  key={item}
                  value={item}
                  className='flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'
                >
                  {item}
                </AutocompletePrimitive.Item>
              )}
            </AutocompletePrimitive.List>
          </AutocompletePrimitive.Popup>
        </AutocompletePrimitive.Positioner>
      </AutocompletePrimitive.Portal>
    </AutocompletePrimitive.Root>
  );
}
