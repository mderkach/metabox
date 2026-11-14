import { ChevronRight, RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, Switch } from '@shared/ui';

import {
  booleanGroupDetails,
  countFilled,
  isBooleanGroupOn,
  isBooleanGroupUnset,
  switchBooleanGroup,
  toBooleanGroupObject,
  UNSET,
  type ConfigNodeFormModel,
} from '../model';
import { errorText, useHasError } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';
import { ConfigNodeFormGroupCount } from './ConfigNodeFormGroupCount';

/**
 * Flag that also takes an object with details (`dns.optimistic`): a switch with a reset, as a
 * plain flag, and the details under a disclosure. Opening the details turns the value into its
 * object form, so the detail fields have a place in the form; the write path folds an object
 * holding only the flag back into the flag. Collapsed details are not mounted.
 */
export function ConfigNodeFormBooleanGroupField({ field, name, children }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control, getValues } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const contentId = useId();
  const [open, setOpen] = useState(() => countFilled(booleanGroupDetails(getValues(name))) > 0);
  const hasError = useHasError([name]);

  if (hasError && !open) {
    setOpen(true);
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        const details = booleanGroupDetails(input.value);

        return (
          <div className='flex flex-col gap-2'>
            <ConfigNodeFormFieldRow
              id={id}
              name={name}
              fieldKey={field.key}
              errorId={errorId}
              error={errorText(t, fieldState.error)}
              aside={
                isBooleanGroupUnset(input.value) ? (
                  <span className='text-xs text-muted-foreground'>{t('boolean.unset')}</span>
                ) : (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('boolean.reset', { name: label })}
                    onClick={() => {
                      setOpen(false);
                      input.onChange(UNSET);
                    }}
                  >
                    <RotateCcw />
                  </Button>
                )
              }
            >
              <Switch
                id={id}
                checked={isBooleanGroupOn(input.value)}
                aria-invalid={fieldState.invalid}
                onCheckedChange={(checked) => {
                  input.onChange(switchBooleanGroup(input.value, checked));
                }}
              />
            </ConfigNodeFormFieldRow>
            <div className='flex flex-col gap-3'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                aria-expanded={open}
                aria-controls={contentId}
                aria-label={t('booleanGroup.detailsOf', { name: label })}
                className='-mx-2 self-start text-xs'
                onClick={() => {
                  if (!open && details === null) {
                    input.onChange(toBooleanGroupObject(input.value));
                  }

                  setOpen(!open);
                }}
              >
                <ChevronRight
                  className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')}
                />
                {t('booleanGroup.details')}
                <ConfigNodeFormGroupCount filled={countFilled(details)} total={field.children?.length ?? 0} />
              </Button>
              <div id={contentId} hidden={!open} className='flex flex-col gap-5 border-l border-border pl-3'>
                {open && details !== null && children}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
