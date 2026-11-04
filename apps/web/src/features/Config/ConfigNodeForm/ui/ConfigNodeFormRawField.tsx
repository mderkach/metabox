import { Eye, EyeOff } from 'lucide-react';
import { use, useEffect, useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, Textarea } from '@shared/ui';

import { isSameValue, secretMaskOf, type ConfigNodeFormModel } from '../model';
import { maskedJsonText } from '../model/ConfigNodeForm.mask';
import { NodeRegistryContext, RawFailuresContext } from './ConfigNodeForm.context';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';
import { ConfigNodeFormRawInput } from './ConfigNodeFormRawInput';

/**
 * Field whose kind the form does not know: a JSON value as text. The field is
 * not lost and does not break the form; unparsed text is not erased but stops
 * the write. A value with secrets is shown masked and read-only until revealed
 * with a button: masked text is not a value.
 */
export function ConfigNodeFormRawField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control } = useFormContext<ConfigNodeFormModel>();
  const failures = use(RawFailuresContext);
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  const [failure, setFailure] = useState<{ reason: string; value: unknown } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const registry = use(NodeRegistryContext);
  const mask = secretMaskOf(field.path, registry);

  // A collapsed group removes the field together with the typed text: its
  // failure no longer stops the write.
  useEffect(
    function trackRawFailure() {
      return function forgetRawFailure() {
        failures.delete(name);
      };
    },
    [failures, name]
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        // The failure belongs to the value at which the text did not parse: a
        // value that changed from outside rewrote the field text too.
        const reason = failure !== null && isSameValue(failure.value, input.value) ? failure.reason : null;
        const masked = maskedJsonText(input.value, mask, registry);
        const hidden = revealed ? null : masked;
        const invalid = reason !== null || fieldState.invalid;
        const describedBy = invalid ? `${hintId} ${errorId}` : hintId;

        return (
          <ConfigNodeFormFieldRow
            id={id}
            name={name}
            fieldKey={field.key}
            errorId={errorId}
            error={reason === null ? errorText(t, fieldState.error) : t('error.parse', { reason })}
            aside={
              masked !== null && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
                  aria-controls={id}
                  onClick={() => {
                    // Switching between the mask and the text drops unparsed text: its failure goes with it.
                    failures.delete(name);
                    setFailure(null);
                    setRevealed(!revealed);
                  }}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </Button>
              )
            }
          >
            {hidden !== null ? (
              <Textarea
                id={id}
                value={hidden}
                readOnly
                spellCheck={false}
                className='min-h-20 font-mono text-xs'
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            ) : (
              <ConfigNodeFormRawInput
                id={id}
                value={input.value}
                invalid={invalid}
                describedBy={describedBy}
                onBlur={input.onBlur}
                onParsed={(value) => {
                  failures.delete(name);
                  setFailure(null);
                  input.onChange(value);
                }}
                onFailure={(text) => {
                  failures.set(name, input.value);
                  setFailure({ reason: text, value: input.value });
                }}
              />
            )}
            <p id={hintId} className='text-xs text-muted-foreground'>
              {t('raw.hint')}
            </p>
          </ConfigNodeFormFieldRow>
        );
      }}
    />
  );
}
