import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import type { RuleCatalogForm } from '../model/RuleCatalogAdd.form';

export function RuleCatalogAddSelect({
  name,
  label,
  placeholder,
  items,
  inherited,
  hint,
}: {
  name: 'outbound' | 'resolver';
  label: string;
  placeholder: string;
  items: { value: string; label: string }[];
  inherited?: string;
  hint?: string;
}) {
  const { control, setValue } = useFormContext<RuleCatalogForm>();
  const id = useId();

  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value === '' ? (inherited ?? null) : field.value}
            disabled={items.length === 0}
            onValueChange={(value: string | null) => {
              field.onChange(value ?? '');
              if (name === 'outbound') setValue('resolver', '');
            }}
          >
            <SelectTrigger
              ref={field.ref}
              onBlur={field.onBlur}
              id={id}
              aria-describedby={hint !== undefined ? `${id}-hint` : undefined}
              className='w-full min-w-0'
            >
              <SelectValue placeholder={placeholder} className='min-w-0 truncate'>
                {hint !== undefined ? field.value : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className='min-w-0 truncate'>{item.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {hint !== undefined && (
        <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
          {hint}
        </p>
      )}
    </div>
  );
}
