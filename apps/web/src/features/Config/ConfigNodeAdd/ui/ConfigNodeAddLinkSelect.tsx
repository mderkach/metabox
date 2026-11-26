import { useId, type ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/ui';

import { CONFIG_NODE_ADD_NS } from '../i18n/ConfigNodeAdd.namespace.generated';
import type { ConnectionLinkModel } from '../model/ConfigNodeAdd.schema';

export function ConfigNodeAddLinkSelect({
  name,
  label,
  help,
  description,
  items,
  onChange,
}: {
  name: 'group' | 'intervalUnit' | 'agent' | 'serverGroup';
  label: string;
  help?: ReactNode;
  description?: string;
  items: { value: string; label: string }[];
  onChange?: (value: string) => void;
}) {
  const { t } = useTranslation(CONFIG_NODE_ADD_NS);
  const { control } = useFormContext<ConnectionLinkModel>();
  const id = useId();
  const errorId = useId();
  const descriptionId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className='min-w-0 gap-1.5' data-invalid={fieldState.invalid}>
          <div className='flex items-center gap-1.5'>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {help}
          </div>
          <Select
            items={items}
            value={field.value}
            onValueChange={(value) => {
              if (value === null) return;
              field.onChange(value);
              onChange?.(value);
            }}
          >
            <SelectTrigger
              ref={field.ref}
              id={id}
              className='w-full min-w-0'
              aria-invalid={fieldState.invalid}
              aria-describedby={
                [description !== undefined && descriptionId, fieldState.invalid && errorId].filter(Boolean).join(' ') ||
                undefined
              }
              onBlur={field.onBlur}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map(({ value, label: itemLabel }) => (
                <SelectItem key={value} value={value} className='wrap-anywhere whitespace-normal'>
                  {itemLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description !== undefined && (
            <p id={descriptionId} className='text-xs text-pretty text-muted-foreground'>
              {description}
            </p>
          )}
          {fieldState.invalid && <FieldError id={errorId}>{t('subscription.groupUnavailable')}</FieldError>}
        </Field>
      )}
    />
  );
}
