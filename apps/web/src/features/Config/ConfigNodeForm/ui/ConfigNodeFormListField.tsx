import { Eye, EyeOff } from 'lucide-react';
import { use, useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, Textarea } from '@shared/ui';

import { secretMaskOf, type ConfigNodeFormModel } from '../model';
import { maskedListText } from '../model/ConfigNodeForm.mask';
import { NodeRegistryContext } from './ConfigNodeForm.context';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';
import { ConfigNodeFormListInput } from './ConfigNodeFormListInput';

/** List of strings: each value is a chip. */
export function ConfigNodeFormListField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  const registry = use(NodeRegistryContext);
  const mask = secretMaskOf(field.path, registry);
  const [revealed, setRevealed] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        const masked = mask === null ? null : maskedListText(input.value, mask);
        const describedBy = fieldState.invalid ? `${hintId} ${errorId}` : hintId;

        return (
          <ConfigNodeFormFieldRow
            id={id}
            name={name}
            fieldKey={field.key}
            errorId={errorId}
            error={errorText(t, fieldState.error)}
            aside={
              masked !== null && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
                  aria-controls={id}
                  onClick={() => {
                    setRevealed(!revealed);
                  }}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </Button>
              )
            }
          >
            {masked !== null && !revealed ? (
              <Textarea
                id={id}
                value={masked}
                readOnly
                spellCheck={false}
                className='min-h-16 font-mono text-xs'
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy}
              />
            ) : (
              <ConfigNodeFormListInput
                id={id}
                label={label}
                value={input.value}
                listable={field.listable === true}
                invalid={fieldState.invalid}
                describedBy={describedBy}
                onBlur={input.onBlur}
                onValue={input.onChange}
              />
            )}
            <p id={hintId} className='text-xs text-muted-foreground'>
              {t('list.hint')}
            </p>
          </ConfigNodeFormFieldRow>
        );
      }}
    />
  );
}
