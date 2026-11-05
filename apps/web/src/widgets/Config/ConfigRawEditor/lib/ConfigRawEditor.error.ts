import type { TFunction } from 'i18next';

import { failureLine, firstJsoncError } from '@shared/lib/jsonc';

export function parseError(t: TFunction<'widgets/Config/ConfigRawEditor'>, text: string): string | null {
  const failure = firstJsoncError(text);

  if (failure === null) {
    return null;
  }

  return t('parseError', { line: failureLine(text, failure), reason: failure.text });
}
