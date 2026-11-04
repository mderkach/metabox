import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@shared/ui';

import { SECRET_MASK, toInputText, UNSET, type ConfigNodeFormModel, type SecretMask } from '../model';
import { isUrlMask } from '../model/ConfigNodeForm.mask';
import { maskUrl } from '../model/ConfigNodeForm.mask';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';

/**
 * Secret: hidden until revealed with a button. The hiding is on screen only:
 * the form value, and with it the draft and the diff, stay full. A fully hidden
 * secret is edited blind, like a password; for a URL the part before the path
 * is visible, and editing opens by revealing: masked text is not a value.
 */
export function ConfigNodeFormSecretField({ field, name, mask }: NodeFieldProps & { mask: SecretMask }) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const [revealed, setRevealed] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        const text = toInputText(input.value);
        const masked = isUrlMask(mask) && !revealed && text !== '' ? maskUrl(text, mask) : null;

        return (
          <ConfigNodeFormFieldRow
            id={id}
            name={name}
            fieldKey={field.key}
            errorId={errorId}
            error={errorText(t, fieldState.error)}
          >
            <InputGroup>
              <InputGroupInput
                id={id}
                type={mask === SECRET_MASK.Whole && !revealed ? 'password' : 'text'}
                value={masked ?? text}
                readOnly={masked !== null}
                autoComplete='off'
                spellCheck={false}
                className='font-mono text-xs'
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? errorId : undefined}
                onBlur={input.onBlur}
                onChange={(event) => {
                  // A URL typed into an empty field is not hidden at the first character.
                  if (isUrlMask(mask)) {
                    setRevealed(true);
                  }

                  input.onChange(event.target.value === '' ? UNSET : event.target.value);
                }}
              />
              <InputGroupAddon align='inline-end'>
                <InputGroupButton
                  size='icon-xs'
                  aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
                  aria-controls={id}
                  onClick={() => {
                    setRevealed(!revealed);
                  }}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </ConfigNodeFormFieldRow>
        );
      }}
    />
  );
}
