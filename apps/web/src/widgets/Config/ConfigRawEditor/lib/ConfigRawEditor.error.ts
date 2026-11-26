import type { TFunction } from 'i18next';

import { failureLine, firstJsoncError } from '@shared/lib/jsonc';

import type { CONFIG_RAW_EDITOR_NS } from '../i18n/ConfigRawEditor.namespace.generated';

export function parseError(t: TFunction<typeof CONFIG_RAW_EDITOR_NS>, text: string): string | null {
  const failure = firstJsoncError(text);

  if (failure === null) {
    return null;
  }

  return t('parseError', { line: failureLine(text, failure), reason: failure.text });
}
