import type { ParseKeys, TFunction } from 'i18next';

import type { SHARED_NS } from '@shared/i18n';

/** Default mode names; a mode from config rules is shown as is. */
const CLASH_MODE_LABEL: Readonly<Record<string, ParseKeys<typeof SHARED_NS> | undefined>> = {
  rule: 'clashMode.rule',
  global: 'clashMode.global',
  direct: 'clashMode.direct',
};

export function toClashModeLabel(t: TFunction<typeof SHARED_NS>, mode: string): string {
  const key = CLASH_MODE_LABEL[mode.toLowerCase()];

  return key === undefined ? mode : t(key);
}
