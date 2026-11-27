import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '../i18n';
import { maskUrl, SECRET_MASK, type SecretMask } from '../lib/secretMask';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './shadcn/input-group';

type SecretInputProps = Pick<
  ComponentProps<typeof InputGroupInput>,
  'id' | 'aria-invalid' | 'aria-describedby' | 'onBlur'
> & {
  label: string;
  mask: SecretMask;
  value: string;
  onValueChange: (value: string) => void;
};

/** URL masks are display-only. A masked URL can be edited after it is revealed. */
export function SecretInput({ label, mask, value, onValueChange, ...input }: SecretInputProps) {
  const { t } = useTranslation(SHARED_NS);
  const [revealed, setRevealed] = useState(false);
  const isUrl = mask !== SECRET_MASK.Whole;
  const masked = isUrl && !revealed && value !== '' ? maskUrl(value, mask) : null;

  return (
    <InputGroup>
      <InputGroupInput
        {...input}
        type={!isUrl && !revealed ? 'password' : 'text'}
        value={masked ?? value}
        readOnly={masked !== null}
        autoComplete='off'
        spellCheck={false}
        className='font-mono text-xs'
        onChange={(event) => {
          if (isUrl) setRevealed(true);
          onValueChange(event.target.value);
        }}
      />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          size='icon-xs'
          aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
          aria-controls={input.id}
          onClick={() => {
            setRevealed(!revealed);
          }}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
