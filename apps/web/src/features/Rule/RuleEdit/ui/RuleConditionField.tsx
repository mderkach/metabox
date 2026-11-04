import type { ParseKeys } from 'i18next';
import { useEffect, useId, useRef, type ComponentType } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label, TokenInput } from '@shared/ui';

import {
  conditionLines,
  isPort,
  RULE_CONDITION,
  RULE_EDIT_ERROR,
  type RuleCondition,
  type RuleEditModel,
} from '../model/RuleEdit.schema';
import { RuleSourceDevices } from './RuleSourceDevices';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Rule/RuleEdit'> | undefined>> = {
  [RULE_EDIT_ERROR.PortInvalid]: 'error.portInvalid',
};

/** Helper under a condition field: the value is still edited as text, the helper appends to it. */
const CONDITION_HELPER: Readonly<Partial<Record<RuleCondition, ComponentType>>> = {
  [RULE_CONDITION.SourceIpCidr]: RuleSourceDevices,
};

const CONDITION_VALID: Readonly<Partial<Record<RuleCondition, (value: string) => boolean>>> = {
  [RULE_CONDITION.Port]: isPort,
};

export function RuleConditionField({ condition, focusOnMount }: { condition: RuleCondition; focusOnMount: boolean }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();
  const id = useId();
  const hintId = useId();
  const Helper = CONDITION_HELPER[condition];
  const input = useRef<HTMLInputElement | null>(null);

  // A condition just picked from the list is typed into next. The frame waits
  // for the closing list, which gives focus back to its trigger.
  useEffect(
    function focusAddedCondition() {
      if (!focusOnMount) {
        return;
      }

      const frame = requestAnimationFrame(function focusInput() {
        input.current?.focus();
      });

      return function cancelFocus() {
        cancelAnimationFrame(frame);
      };
    },
    [focusOnMount]
  );

  return (
    <Controller
      control={control}
      name={`conditions.${condition}`}
      render={({ field, fieldState }) => {
        const errorKey = fieldState.error?.message === undefined ? undefined : ERROR_KEY[fieldState.error.message];

        return (
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={id}>{t(`condition.${condition}.label`)}</Label>
            <TokenInput
              id={id}
              label={t(`condition.${condition}.label`)}
              spellCheck={false}
              autoCapitalize='off'
              autoComplete='off'
              aria-describedby={hintId}
              aria-invalid={errorKey !== undefined}
              placeholder={t(`condition.${condition}.placeholder`)}
              isValid={CONDITION_VALID[condition]}
              value={conditionLines(field.value)}
              onValueChange={(values) => {
                field.onChange(values.join('\n'));
              }}
              onBlur={field.onBlur}
              name={field.name}
              disabled={field.disabled}
              ref={(element) => {
                field.ref(element);
                input.current = element;
              }}
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
