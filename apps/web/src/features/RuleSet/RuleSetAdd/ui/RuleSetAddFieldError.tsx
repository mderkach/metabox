import { useTranslation } from 'react-i18next';

import { RULE_SET_ADD_NS } from '../i18n/RuleSetAdd.namespace.generated';
import { errorText } from './RuleSetAdd.error';

export function RuleSetAddFieldError({ id, message }: { id: string; message: string | undefined }) {
  const { t } = useTranslation(RULE_SET_ADD_NS);
  const text = errorText(t, message);

  return text === null ? null : (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}
