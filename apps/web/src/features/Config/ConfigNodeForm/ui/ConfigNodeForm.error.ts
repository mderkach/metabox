import type { ParseKeys, TFunction } from 'i18next';
import { type FieldError as FormFieldError } from 'react-hook-form';

import { NODE_OVERRIDE_ERROR } from '../model';
import { RAW_PARSE_ERROR } from './ConfigNodeForm.context';
import { NS } from './ConfigNodeForm.namespace';

/**
 * Remark code into text. The generated schema carries no failure codes, so the
 * translation goes by the Zod remark code that the resolver puts into `type`;
 * override checks put their own code there.
 */
const ERROR_KEY: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  invalid_format: 'error.duration',
  too_small: 'error.tooSmall',
  too_big: 'error.tooBig',
  invalid_type: 'error.type',
  [NODE_OVERRIDE_ERROR.Required]: 'error.required',
  [NODE_OVERRIDE_ERROR.RealityPublicKey]: 'error.realityPublicKey',
  [NODE_OVERRIDE_ERROR.RealityShortId]: 'error.realityShortId',
};

export function errorText(t: TFunction<typeof NS>, error: FormFieldError | undefined): string | null {
  if (error === undefined) {
    return null;
  }

  if (error.type === RAW_PARSE_ERROR) {
    return t('error.parse', { reason: error.message ?? '' });
  }

  return t(ERROR_KEY[error.type] ?? 'error.invalid');
}
