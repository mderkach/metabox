import type { TFunction } from 'i18next';

import type { RULE_SET_REMOTE_FORM_NS } from '../i18n/RuleSetRemoteForm.namespace.generated';
import { RULE_SET_ADD_ERROR_KEY } from '../model/RuleSetAdd.constants';

/** Schema failure code into text: the message arrives as a string, the keys are our own. */
export function errorText(t: TFunction<typeof RULE_SET_REMOTE_FORM_NS>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : RULE_SET_ADD_ERROR_KEY[message];

  return key === undefined ? null : t(key);
}
