import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';
import { ChevronDownIcon } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './shadcn/input-group';

/**
 * A free-input field with suggestions. The value is the field text itself: a suggestion
 * only fills it in, and a name that is not in the list remains a valid
 * input. shadcn has no such primitive — its combobox only selects from
 * the list.
 *
 * Filtering is done by the caller: `items` are shown as they are and in the same order.
 *
 * Without suggestions the list does not open. An open Base UI list hides the rest of the page
 * from the screen reader (`aria-hidden`), and an empty invisible popup
 * would mute the warning the form shows under the field.
 */
export function Autocomplete({
  items,
  value,
  onValueChange,
  className,
  listClassName,
  onFocus,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange'> & {
  items: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  listClassName?: string;
}) {
  const { t } = useTranslation('shared');
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
      <AutocompletePrimitive.InputGroup render={<InputGroup />}>
        <AutocompletePrimitive.Input
          render={<InputGroupInput className={className} />}
          onFocus={(event) => {
            setOpen(true);
            onFocus?.(event);
          }}
          {...props}
        />
        <InputGroupAddon align='inline-end'>
          <AutocompletePrimitive.Trigger
            render={<InputGroupButton size='icon-xs' aria-label={t('autocomplete.toggle')} />}
          >
            <ChevronDownIcon className='pointer-events-none size-4 text-muted-foreground' />
          </AutocompletePrimitive.Trigger>
        </InputGroupAddon>
      </AutocompletePrimitive.InputGroup>
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
