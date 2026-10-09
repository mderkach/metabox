import type { ParseKeys } from 'i18next';
import { useId, useState, type ComponentType } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@shared/ui';

import {
  RULE_CONDITION,
  RULE_CONDITIONS,
  RULE_EDIT_ERROR,
  type RuleCondition,
  type RuleEditModel,
} from '../model/RuleEdit.schema';
import { RuleSourceDevices } from './RuleSourceDevices';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Rule/RuleEdit'> | undefined>> = {
  [RULE_EDIT_ERROR.PortInvalid]: 'error.portInvalid',
};

/** Помощник под полем условия: значение по-прежнему правится текстом, помощник его дописывает. */
const CONDITION_HELPER: Readonly<Partial<Record<RuleCondition, ComponentType>>> = {
  [RULE_CONDITION.SourceIpCidr]: RuleSourceDevices,
};

/**
 * Ходовые условия правила. Видны заданные; остальные добавляются выбором, а
 * не стоят пустыми полями: у правила обычно одно-два условия.
 */
export function RuleConditionFields({ initial }: { initial: readonly RuleCondition[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const [shown, setShown] = useState<readonly RuleCondition[]>(initial);
  const hidden = RULE_CONDITIONS.filter((key) => !shown.includes(key));
  const addId = useId();

  return (
    <fieldset className='flex flex-col gap-3'>
      <legend className='mb-1.5 text-sm font-medium'>{t('field.conditions.label')}</legend>

      {shown.map((key) => (
        <ConditionField key={key} condition={key} />
      ))}

      {hidden.length > 0 && (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={addId} className='sr-only'>
            {t('field.conditions.add')}
          </Label>
          <Select
            value={null}
            onValueChange={(key: RuleCondition | null) => {
              if (key !== null) {
                setShown([...shown, key]);
              }
            }}
          >
            <SelectTrigger id={addId} size='sm' className='self-start'>
              <SelectValue placeholder={t('field.conditions.add')} />
            </SelectTrigger>
            <SelectContent>
              {hidden.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`condition.${key}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </fieldset>
  );
}

function ConditionField({ condition }: { condition: RuleCondition }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();
  const id = useId();
  const hintId = useId();
  const Helper = CONDITION_HELPER[condition];

  return (
    <Controller
      control={control}
      name={`conditions.${condition}`}
      render={({ field, fieldState }) => {
        const errorKey = fieldState.error?.message === undefined ? undefined : ERROR_KEY[fieldState.error.message];

        return (
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={id}>{t(`condition.${condition}.label`)}</Label>
            <Textarea
              id={id}
              rows={2}
              spellCheck={false}
              aria-describedby={hintId}
              aria-invalid={errorKey !== undefined}
              placeholder={t(`condition.${condition}.placeholder`)}
              className='font-mono text-sm'
              {...field}
            />
            {errorKey === undefined ? (
              <p id={hintId} className='text-xs text-muted-foreground'>
                {t('field.conditions.hint')}
              </p>
            ) : (
              <p id={hintId} role='alert' className='text-xs text-destructive'>
                {t(errorKey)}
              </p>
            )}
            {Helper !== undefined && <Helper />}
          </div>
        );
      }}
    />
  );
}
