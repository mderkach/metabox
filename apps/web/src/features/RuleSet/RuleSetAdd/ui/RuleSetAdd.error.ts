import type { TFunction } from 'i18next';

import { RULE_SET_ADD_ERROR_KEY } from '../model/RuleSetAdd.constants';

/** Schema failure code into text: the message arrives as a string, the keys are our own. */
export function errorText(t: TFunction<'features/RuleSet/RuleSetAdd'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : RULE_SET_ADD_ERROR_KEY[message];

  return key === undefined ? null : t(key);
}
