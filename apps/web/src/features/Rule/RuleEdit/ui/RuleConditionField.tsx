import type { ParseKeys } from 'i18next';
import { useEffect, useId, useRef, type ComponentType } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useDeviceIndex } from '@entities/Device';
import { Label, TokenInput } from '@shared/ui';

import { useConditionSuggestions } from '../lib/RuleEdit.suggestions';
import { sourceDeviceName } from '../model/RuleEdit.model';
import {
  conditionLines,
  isCidr,
  isPort,
  RULE_CONDITION,
  RULE_EDIT_ERROR,
  type RuleCondition,
  type RuleEditModel,
} from '../model/RuleEdit.schema';
import { RuleConditionHint } from './RuleConditionHint';
import { RuleSourceDevices } from './RuleSourceDevices';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Rule/RuleEdit'> | undefined>> = {
  [RULE_EDIT_ERROR.PortInvalid]: 'error.portInvalid',
  [RULE_EDIT_ERROR.CidrInvalid]: 'error.cidrInvalid',
};

/** What a condition field shows under itself besides the hint. */
const CONDITION_HELPER: Readonly<Partial<Record<RuleCondition, ComponentType>>> = {
  [RULE_CONDITION.SourceIpCidr]: RuleSourceDevices,
};

const CONDITION_VALID: Readonly<Partial<Record<RuleCondition, (value: string) => boolean>>> = {
  [RULE_CONDITION.IpCidr]: isCidr,
  [RULE_CONDITION.SourceIpCidr]: isCidr,
  [RULE_CONDITION.Port]: isPort,
};

export function RuleConditionField({ condition, focusOnMount }: { condition: RuleCondition; focusOnMount: boolean }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();
  const id = useId();
  const hintId = useId();
  const Helper = CONDITION_HELPER[condition];
  const input = useRef<HTMLInputElement | null>(null);
  // The index is a shared cache: the device helper under the source field polls it.
  const devices = useDeviceIndex();
  const tokenLabel =
    condition === RULE_CONDITION.SourceIpCidr ? (token: string) => sourceDeviceName(token, devices) : undefined;
  const suggestions = useConditionSuggestions(condition, devices);

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
              tokenLabel={tokenLabel}
              suggestions={suggestions}
              description={<RuleConditionHint id={hintId} error={errorKey} helper={Helper} />}
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
          </div>
        );
      }}
    />
  );
}
