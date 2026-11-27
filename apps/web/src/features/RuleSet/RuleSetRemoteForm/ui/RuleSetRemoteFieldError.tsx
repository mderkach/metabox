import { useTranslation } from 'react-i18next';

import { RULE_SET_REMOTE_FORM_NS } from '../i18n/RuleSetRemoteForm.namespace.generated';
import { errorText } from './RuleSetAdd.error';

export function RuleSetRemoteFieldError({ id, message }: { id: string; message: string | undefined }) {
  const { t } = useTranslation(RULE_SET_REMOTE_FORM_NS);
  const text = errorText(t, message);

  return text === null ? null : (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}
