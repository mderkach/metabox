import { useTranslation } from 'react-i18next';

import { errorText } from './RuleSetAdd.error';

export function RuleSetAddFieldError({ id, message }: { id: string; message: string | undefined }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const text = errorText(t, message);

  return text === null ? null : (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}
