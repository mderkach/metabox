import type { ParseKeys, TFunction } from 'i18next';

/** Default mode names; a mode from config rules is shown as is. */
const CLASH_MODE_LABEL: Readonly<Record<string, ParseKeys<'shared'> | undefined>> = {
  rule: 'clashMode.rule',
  global: 'clashMode.global',
  direct: 'clashMode.direct',
};

export function toClashModeLabel(t: TFunction<'shared'>, mode: string): string {
  const key = CLASH_MODE_LABEL[mode.toLowerCase()];

  return key === undefined ? mode : t(key);
}
