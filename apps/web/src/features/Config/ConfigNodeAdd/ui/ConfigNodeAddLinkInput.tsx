import type { ParseKeys } from 'i18next';
import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Field, FieldError, FieldLabel, Input } from '@shared/ui';

import { NODE_ADD_ERROR, type ConnectionLinkModel } from '../model/ConfigNodeAdd.schema';
import { SERVER_ERROR } from '../model/ConfigNodeAdd.server';
import { SUBSCRIPTION_ERROR } from '../model/ConfigNodeAdd.subscription';

const NS = 'features/Config/ConfigNodeAdd';

const INPUT_ERRORS: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  [SERVER_ERROR.TagRequired]: 'server.tagRequired',
  [SERVER_ERROR.TagTaken]: 'server.tagTaken',
  [SERVER_ERROR.GroupRequired]: 'subscription.groupNameRequired',
  [SERVER_ERROR.GroupTaken]: 'subscription.groupTaken',
  [SUBSCRIPTION_ERROR.TagRequired]: 'subscription.tagRequired',
  [SUBSCRIPTION_ERROR.TagTaken]: 'subscription.tagTaken',
  [NODE_ADD_ERROR.TagRequired]: 'subscription.groupNameRequired',
  [SUBSCRIPTION_ERROR.GroupTaken]: 'subscription.groupTaken',
  [SUBSCRIPTION_ERROR.Interval]: 'subscription.intervalError',
  [SUBSCRIPTION_ERROR.Agent]: 'subscription.agentError',
};

export function ConfigNodeAddLinkInput({
  name,
  label,
  inputMode,
  onChange,
  max,
  suggestedValue,
}: {
  name: 'tag' | 'groupName' | 'intervalValue' | 'agentValue' | 'serverTag' | 'serverGroupName';
  label: string;
  inputMode?: 'numeric';
  onChange?: () => void;
  max?: number;
  suggestedValue?: string;
}) {
  const { t } = useTranslation(NS);
  const { control, trigger } = useFormContext<ConnectionLinkModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const key = INPUT_ERRORS[fieldState.error?.message ?? ''];

        return (
          <Field className='min-w-0 gap-1.5' data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
              {...field}
              value={field.value ?? suggestedValue ?? ''}
              id={id}
              className='w-full font-mono'
              type={inputMode === 'numeric' ? 'number' : undefined}
              min={inputMode === 'numeric' ? 1 : undefined}
              max={max}
              inputMode={inputMode}
              autoComplete='off'
              spellCheck={false}
              aria-invalid={fieldState.invalid}
              aria-describedby={key === undefined ? undefined : errorId}
              onBlur={() => {
                field.onBlur();
                if (name === 'tag' && field.value?.trim() !== '') void trigger('tag');
              }}
              onChange={(event) => {
                field.onChange(event);
                onChange?.();
              }}
            />
            {key !== undefined && <FieldError id={errorId}>{t(key, { max })}</FieldError>}
          </Field>
        );
      }}
    />
  );
}
